// graphql/resolvers.js - Optimized with DataLoader, pagination, and search
const Post = require('../models/Post');
const Image = require('../models/Image');
const Tag = require('../models/Tag');
const Category = require('../models/Category');
const DataLoader = require('dataloader');
const logger = require('../config/logger');
const { 
  ValidationError, 
  NotFoundError, 
  ConflictError,
  withPerformanceLog 
} = require('../utils/errors');

// DataLoader instances to solve N+1 query problem
const createLoaders = () => ({
  // Load categories by IDs
  categories: new DataLoader(async (categoryIds) => {
    const startTime = Date.now();
    const categories = await Category.find({ 
      _id: { $in: categoryIds },
      isActive: true 
    });
    
    logger.dbOperation('batchLoad', 'categories', { ids: categoryIds }, Date.now() - startTime);
    
    // Return in same order as requested
    return categoryIds.map(id => 
      categories.find(cat => cat._id.toString() === id.toString()) || null
    );
  }),

  // Load tags by IDs
  tags: new DataLoader(async (tagIds) => {
    const startTime = Date.now();
    const tags = await Tag.find({ _id: { $in: tagIds } });
    
    logger.dbOperation('batchLoad', 'tags', { ids: tagIds }, Date.now() - startTime);
    
    return tagIds.map(id => 
      tags.find(tag => tag._id.toString() === id.toString()) || null
    );
  }),

  // Load posts by IDs
  posts: new DataLoader(async (postIds) => {
    const startTime = Date.now();
    const posts = await Post.findActive({ _id: { $in: postIds } });
    
    logger.dbOperation('batchLoad', 'posts', { ids: postIds }, Date.now() - startTime);
    
    return postIds.map(id => 
      posts.find(post => post._id.toString() === id.toString()) || null
    );
  }),

  // Load subcategories by parent IDs
  subcategories: new DataLoader(async (parentIds) => {
    const startTime = Date.now();
    const subcategories = await Category.find({ 
      parent: { $in: parentIds },
      isActive: true 
    });
    
    logger.dbOperation('batchLoad', 'subcategories', { parentIds }, Date.now() - startTime);
    
    // Group by parent ID
    return parentIds.map(parentId => 
      subcategories.filter(cat => cat.parent?.toString() === parentId.toString())
    );
  }),

  // Load post counts by category IDs
  categoryPostCounts: new DataLoader(async (categoryIds) => {
    const startTime = Date.now();
    const pipeline = [
      { $match: { categories: { $in: categoryIds }, isDeleted: false, status: 'published' } },
      { $unwind: '$categories' },
      { $match: { categories: { $in: categoryIds } } },
      { $group: { _id: '$categories', count: { $sum: 1 } } }
    ];
    
    const results = await Post.aggregate(pipeline);
    logger.dbOperation('aggregate', 'posts', { pipeline }, Date.now() - startTime);
    
    const countMap = new Map(results.map(r => [r._id.toString(), r.count]));
    return categoryIds.map(id => countMap.get(id.toString()) || 0);
  })
});

// Pagination helper
const paginate = (query, { page = 1, limit = 10, maxLimit = 100 }) => {
  const normalizedPage = Math.max(1, parseInt(page));
  const normalizedLimit = Math.min(parseInt(limit), maxLimit);
  const skip = (normalizedPage - 1) * normalizedLimit;
  
  return {
    skip,
    limit: normalizedLimit,
    page: normalizedPage
  };
};

// Enhanced search functionality
const buildSearchQuery = (searchText) => {
  if (!searchText || typeof searchText !== 'string') return {};
  
  const trimmedText = searchText.trim();
  if (!trimmedText) return {};
  
  // Use MongoDB text search if available, fallback to regex
  if (trimmedText.length > 2) {
    return { $text: { $search: trimmedText } };
  }
  
  // For short queries, use regex (less efficient but works)
  return {
    $or: [
      { title: { $regex: trimmedText, $options: 'i' } },
      { content: { $regex: trimmedText, $options: 'i' } }
    ]
  };
};

// Enhanced filter builder
const buildFilterQuery = (filter = {}) => {
  const query = { isDeleted: false };
  
  // Text search
  if (filter.searchText) {
    Object.assign(query, buildSearchQuery(filter.searchText));
  }
  
  // Status filter
  if (filter.status) {
    query.status = filter.status;
  }
  
  // Category filter
  if (filter.categoryId) {
    query.categories = filter.categoryId;
  }
  
  // Tag filter
  if (filter.tagIds && Array.isArray(filter.tagIds) && filter.tagIds.length > 0) {
    query.tags = { $in: filter.tagIds };
  }
  
  // Date range filters
  if (filter.publishedAfter || filter.publishedBefore) {
    query.publishedAt = {};
    if (filter.publishedAfter) {
      query.publishedAt.$gte = new Date(filter.publishedAfter);
    }
    if (filter.publishedBefore) {
      query.publishedAt.$lte = new Date(filter.publishedBefore);
    }
  }
  
  // Author filter (when auth is implemented)
  if (filter.authorId) {
    query.author = filter.authorId;
  }
  
  return query;
};

const resolvers = {
  Query: {
    // Enhanced posts query with pagination
    posts: async (_, { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' }) => {
      const operation = withPerformanceLog('query:posts');
      
      return operation(async () => {
        const pagination = paginate({}, { page, limit });
        const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
        
        const [posts, total] = await Promise.all([
          Post.findActive()
            .sort(sort)
            .skip(pagination.skip)
            .limit(pagination.limit)
            .select('title slug status publishedAt createdAt updatedAt categories tags viewCount')
            .lean(),
          Post.countDocuments({ isDeleted: false })
        ]);
        
        return {
          posts,
          pagination: {
            page: pagination.page,
            limit: pagination.limit,
            total,
            pages: Math.ceil(total / pagination.limit),
            hasNext: pagination.page * pagination.limit < total,
            hasPrev: pagination.page > 1
          }
        };
      });
    },

    // Single post query
    post: async (_, { id }, { loaders }) => {
      const operation = withPerformanceLog('query:post');
      
      return operation(async () => {
        const post = await Post.findOne({ _id: id, isDeleted: false });
        if (!post) {
          throw new NotFoundError('Post', id);
        }
        
        // Increment view count
        post.viewCount = (post.viewCount || 0) + 1;
        await post.save();
        
        return post;
      });
    },

    // Enhanced categories query with hierarchy
    categories: async (_, { includeEmpty = false, sortBy = 'sortOrder' }) => {
      const operation = withPerformanceLog('query:categories');
      
      return operation(async () => {
        const query = { isActive: true };
        const sort = { [sortBy]: 1, name: 1 };
        
        let categories = await Category.find(query)
          .sort(sort)
          .lean();
        
        // Filter out empty categories if requested
        if (!includeEmpty) {
          const categoryIds = categories.map(c => c._id);
          const postCounts = await Promise.all(
            categoryIds.map(id => 
              Post.countDocuments({ 
                categories: id, 
                isDeleted: false, 
                status: 'published' 
              })
            )
          );
          
          categories = categories.filter((_, index) => postCounts[index] > 0);
        }
        
        return categories;
      });
    },

    // Single category query
    category: async (_, { id }) => {
      const operation = withPerformanceLog('query:category');
      
      return operation(async () => {
        const category = await Category.findOne({ _id: id, isActive: true });
        if (!category) {
          throw new NotFoundError('Category', id);
        }
        return category;
      });
    },

    // Enhanced posts summary
    postsSummary: async () => {
      const operation = withPerformanceLog('query:postsSummary');
      
      return operation(async () => {
        const [summary] = await Post.aggregate([
          { $match: { isDeleted: false } },
          {
            $group: {
              _id: null,
              totalPosts: { $sum: 1 },
              drafts: { $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] } },
              published: { $sum: { $cond: [{ $eq: ['$status', 'published'] }, 1, 0] } },
              pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
              archived: { $sum: { $cond: [{ $eq: ['$status', 'archived'] }, 1, 0] } }
            }
          }
        ]);
        
        return summary || {
          totalPosts: 0,
          drafts: 0,
          published: 0,
          pending: 0,
          archived: 0
        };
      });
    },

    // Enhanced recent posts
    recentPosts: async (_, { limit = 5 }) => {
      const operation = withPerformanceLog('query:recentPosts');
      
      return operation(async () => {
        return Post.findActive({ status: 'published' })
          .sort({ publishedAt: -1 })
          .limit(Math.min(limit, 20))
          .select('title slug publishedAt viewCount categories')
          .lean();
      });
    },

    // Enhanced filtered posts with pagination and search
    filteredPosts: async (_, { filter = {}, page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' }) => {
      const operation = withPerformanceLog('query:filteredPosts');
      
      return operation(async () => {
        const query = buildFilterQuery(filter);
        const pagination = paginate({}, { page, limit });
        const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
        
        // Add text search score sorting if text search is used
        if (query.$text) {
          sort.score = { $meta: 'textScore' };
        }
        
        const [posts, total] = await Promise.all([
          Post.find(query)
            .sort(sort)
            .skip(pagination.skip)
            .limit(pagination.limit)
            .select('title slug status publishedAt createdAt updatedAt categories tags viewCount')
            .lean(),
          Post.countDocuments(query)
        ]);
        
        return {
          posts,
          pagination: {
            page: pagination.page,
            limit: pagination.limit,
            total,
            pages: Math.ceil(total / pagination.limit),
            hasNext: pagination.page * pagination.limit < total,
            hasPrev: pagination.page > 1
          },
          filter
        };
      });
    },

    // Full-text search with ranking
    searchPosts: async (_, { query, page = 1, limit = 10 }) => {
      const operation = withPerformanceLog('query:searchPosts');
      
      return operation(async () => {
        const searchQuery = {
          $text: { $search: query },
          isDeleted: false,
          status: 'published'
        };
        
        const pagination = paginate({}, { page, limit });
        
        const [posts, total] = await Promise.all([
          Post.find(searchQuery, { score: { $meta: 'textScore' } })
            .sort({ score: { $meta: 'textScore' } })
            .skip(pagination.skip)
            .limit(pagination.limit)
            .lean(),
          Post.countDocuments(searchQuery)
        ]);
        
        return {
          posts,
          pagination: {
            page: pagination.page,
            limit: pagination.limit,
            total,
            pages: Math.ceil(total / pagination.limit),
            hasNext: pagination.page * pagination.limit < total,
            hasPrev: pagination.page > 1
          },
          query
        };
      });
    },

    // Enhanced tags query
    tags: async (_, { includeEmpty = false, limit = 100 }) => {
      const operation = withPerformanceLog('query:tags');
      
      return operation(async () => {
        let tags = await Tag.find({})
          .sort({ name: 1 })
          .limit(Math.min(limit, 500))
          .lean();
        
        if (!includeEmpty) {
          const tagIds = tags.map(t => t._id);
          const postCounts = await Promise.all(
            tagIds.map(id => 
              Post.countDocuments({ 
                tags: id, 
                isDeleted: false, 
                status: 'published' 
              })
            )
          );
          
          tags = tags.filter((_, index) => postCounts[index] > 0);
        }
        
        return tags;
      });
    }
  },

  Mutation: {
    // Enhanced create post
    createPost: async (_, args, { user }) => {
      const operation = withPerformanceLog('mutation:createPost');
      
      return operation(async () => {
        // Validate categories exist
        if (args.categories && args.categories.length > 0) {
          const categoryCount = await Category.countDocuments({
            _id: { $in: args.categories },
            isActive: true
          });
          
          if (categoryCount !== args.categories.length) {
            throw new ValidationError('One or more categories do not exist');
          }
        }
        
        const post = new Post({
          ...args,
          author: user?.id // Set when auth is implemented
        });
        
        const savedPost = await post.save();
        
        logger.audit('create', user?.id, 'post', { 
          postId: savedPost._id,
          title: savedPost.title 
        });
        
        return savedPost;
      });
    },

    // Enhanced update post
    updatePost: async (_, { id, ...updates }, { user }) => {
      const operation = withPerformanceLog('mutation:updatePost');
      
      return operation(async () => {
        const post = await Post.findOne({ _id: id, isDeleted: false });
        if (!post) {
          throw new NotFoundError('Post', id);
        }
        
        // Validate categories if updating
        if (updates.categories && updates.categories.length > 0) {
          const categoryCount = await Category.countDocuments({
            _id: { $in: updates.categories },
            isActive: true
          });
          
          if (categoryCount !== updates.categories.length) {
            throw new ValidationError('One or more categories do not exist');
          }
        }
        
        Object.assign(post, updates);
        post.version += 1;
        
        const savedPost = await post.save();
        
        logger.audit('update', user?.id, 'post', { 
          postId: savedPost._id,
          title: savedPost.title,
          changes: Object.keys(updates)
        });
        
        return savedPost;
      });
    },

    // Enhanced delete post (soft delete)
    deletePost: async (_, { id }, { user }) => {
      const operation = withPerformanceLog('mutation:deletePost');
      
      return operation(async () => {
        const post = await Post.findOne({ _id: id, isDeleted: false });
        if (!post) {
          throw new NotFoundError('Post', id);
        }
        
        await Post.softDelete(id);
        
        logger.audit('delete', user?.id, 'post', { 
          postId: id,
          title: post.title 
        });
        
        return true;
      });
    },

    // Enhanced create category
    createCategory: async (_, { name, slug, description, parentId }, { user }) => {
      const operation = withPerformanceLog('mutation:createCategory');
      
      return operation(async () => {
        // Check for existing name/slug
        const existing = await Category.findOne({
          $or: [{ name }, { slug }],
          isActive: true
        });
        
        if (existing) {
          throw new ConflictError(`Category with ${existing.name === name ? 'name' : 'slug'} already exists`);
        }
        
        const category = new Category({
          name,
          slug,
          description,
          parent: parentId || null
        });
        
        const savedCategory = await category.save();
        
        logger.audit('create', user?.id, 'category', { 
          categoryId: savedCategory._id,
          name: savedCategory.name 
        });
        
        return savedCategory;
      });
    },

    // Enhanced update category
    updateCategory: async (_, { id, ...updates }, { user }) => {
      const operation = withPerformanceLog('mutation:updateCategory');
      
      return operation(async () => {
        const category = await Category.findOne({ _id: id, isActive: true });
        if (!category) {
          throw new NotFoundError('Category', id);
        }
        
        // Check for conflicts if updating name or slug
        if (updates.name || updates.slug) {
          const conflicts = [];
          if (updates.name) conflicts.push({ name: updates.name });
          if (updates.slug) conflicts.push({ slug: updates.slug });
          
          const existing = await Category.findOne({
            $or: conflicts,
            _id: { $ne: id },
            isActive: true
          });
          
          if (existing) {
            throw new ConflictError('Category name or slug already exists');
          }
        }
        
        Object.assign(category, updates);
        const savedCategory = await category.save();
        
        logger.audit('update', user?.id, 'category', { 
          categoryId: savedCategory._id,
          name: savedCategory.name,
          changes: Object.keys(updates)
        });
        
        return savedCategory;
      });
    },

    // Safe delete category
    deleteCategory: async (_, { id }, { user }) => {
      const operation = withPerformanceLog('mutation:deleteCategory');
      
      return operation(async () => {
        await Category.safeDelete(id);
        
        logger.audit('delete', user?.id, 'category', { categoryId: id });
        
        return true;
      });
    },

    // Enhanced update post category
    updatePostCategory: async (_, { postId, categoryId }, { user }) => {
      const operation = withPerformanceLog('mutation:updatePostCategory');
      
      return operation(async () => {
        const [post, category] = await Promise.all([
          Post.findOne({ _id: postId, isDeleted: false }),
          Category.findOne({ _id: categoryId, isActive: true })
        ]);
        
        if (!post) throw new NotFoundError('Post', postId);
        if (!category) throw new NotFoundError('Category', categoryId);
        
        post.categories = [categoryId];
        post.version += 1;
        
        const savedPost = await post.save();
        
        logger.audit('update', user?.id, 'post', { 
          postId,
          action: 'categoryUpdate',
          categoryId 
        });
        
        return savedPost;
      });
    }
  },

  // Field resolvers using DataLoader
  Post: {
    categories: async (parent, _, { loaders }) => {
      if (!parent.categories || parent.categories.length === 0) return [];
      return loaders.categories.loadMany(parent.categories);
    },

    tags: async (parent, _, { loaders }) => {
      if (!parent.tags || parent.tags.length === 0) return [];
      return loaders.tags.loadMany(parent.tags);
    },

    images: async (parent) => {
      return Image.find({ postId: parent._id });
    }
  },

  Category: {
    parent: async (parent, _, { loaders }) => {
      if (!parent.parent) return null;
      return loaders.categories.load(parent.parent);
    },

    subcategories: async (parent, _, { loaders }) => {
      const subcategories = await loaders.subcategories.load(parent._id);
      return subcategories || [];
    },

    postCount: async (parent, _, { loaders }) => {
      return loaders.categoryPostCounts.load(parent._id);
    }
  },

  Tag: {
    postCount: async (parent) => {
      return Post.countDocuments({
        tags: parent._id,
        isDeleted: false,
        status: 'published'
      });
    }
  }
};

// Context function to provide loaders
const createContext = ({ req }) => {
  return {
    user: req?.user,
    loaders: createLoaders(),
    requestId: req?.requestId
  };
};

module.exports = { 
  resolvers, 
  createContext 
};