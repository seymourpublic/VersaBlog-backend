// graphql/schema.js
// This file defines the GraphQL schema for the blog application using Apollo Server and GraphQL.
// It includes types for Post, Image, Tag, and Category, along with queries and mutations for managing these entities.
// The schema is exported for use in the Apollo Server setup.
// File: graphql/schema.js
// graphql/schema.js
// graphql/schema.js - Enhanced schema with pagination and consistent types
const { gql } = require('apollo-server-express');

const typeDefs = gql`
  scalar Date

  # Pagination types
  type PaginationInfo {
    page: Int!
    limit: Int!
    total: Int!
    pages: Int!
    hasNext: Boolean!
    hasPrev: Boolean!
  }

  # Enhanced Post type
  type Post {
    id: ID!
    title: String!
    content: String!
    slug: String
    status: PostStatus!
    publishedAt: Date
    createdAt: Date!
    updatedAt: Date!
    version: Int!
    images: [Image]
    categories: [Category!]!
    tags: [Tag!]!
    viewCount: Int!
    readingTime: Int
    excerpt: String
    metaDescription: String
    featuredImage: String
    author: User
  }

  # Post status enum
  enum PostStatus {
    DRAFT
    PUBLISHED
    ARCHIVED
    PENDING
  }

  # Paginated posts response
  type PostsResponse {
    posts: [Post!]!
    pagination: PaginationInfo!
  }

  # Search response
  type SearchResponse {
    posts: [Post!]!
    pagination: PaginationInfo!
    query: String!
  }

  # Filtered posts response
  type FilteredPostsResponse {
    posts: [Post!]!
    pagination: PaginationInfo!
  }

  # Enhanced Category type
  type Category {
    id: ID!
    name: String!
    slug: String!
    description: String
    parent: Category
    subcategories: [Category!]!
    postCount: Int!
    color: String
    icon: String
    sortOrder: Int!
    isActive: Boolean!
    createdAt: Date!
    updatedAt: Date!
  }

  # Enhanced Tag type
  type Tag {
    id: ID!
    name: String!
    slug: String!
    description: String
    color: String
    postCount: Int!
    createdAt: Date!
    updatedAt: Date!
  }

  # Image type
  type Image {
    id: ID!
    postId: ID!
    url: String!
    altText: String
    uploadedAt: Date!
  }

  # User type (for future auth implementation)
  type User {
    id: ID!
    email: String!
    name: String!
    role: UserRole!
    createdAt: Date!
  }

  enum UserRole {
    ADMIN
    EDITOR
    AUTHOR
  }

  # Enhanced post summary
  type PostSummary {
    totalPosts: Int!
    drafts: Int!
    published: Int!
    pending: Int!
    archived: Int!
  }

  # Enhanced filter input
  input PostFilter {
    searchText: String
    categoryId: ID
    tagIds: [ID!]
    publishedAfter: Date
    publishedBefore: Date
    status: PostStatus
    authorId: ID
  }

  # Sort options
  enum PostSortField {
    CREATED_AT
    UPDATED_AT
    PUBLISHED_AT
    TITLE
    VIEW_COUNT
  }

  enum SortOrder {
    ASC
    DESC
  }

  # Input types for mutations
  input CreatePostInput {
    title: String!
    content: String!
    slug: String
    status: PostStatus = DRAFT
    categories: [ID!]
    tags: [ID!]
    metaDescription: String
    featuredImage: String
  }

  input UpdatePostInput {
    title: String
    content: String
    slug: String
    status: PostStatus
    categories: [ID!]
    tags: [ID!]
    metaDescription: String
    featuredImage: String
  }

  input CreateCategoryInput {
    name: String!
    slug: String!
    description: String
    parentId: ID
    color: String
    icon: String
    sortOrder: Int = 0
  }

  input UpdateCategoryInput {
    name: String
    slug: String
    description: String
    parentId: ID
    color: String
    icon: String
    sortOrder: Int
    isActive: Boolean
  }

  input CreateTagInput {
    name: String!
    description: String
    color: String
  }

  input UpdateTagInput {
    name: String
    description: String
    color: String
  }

  # Queries
  type Query {
    # Enhanced post queries
    posts(
      page: Int = 1
      limit: Int = 10
      sortBy: PostSortField = CREATED_AT
      sortOrder: SortOrder = DESC
    ): PostsResponse!

    post(id: ID!): Post

    # Enhanced filtering
    filteredPosts(
      filter: PostFilter
      page: Int = 1
      limit: Int = 10
      sortBy: PostSortField = CREATED_AT
      sortOrder: SortOrder = DESC
    ): FilteredPostsResponse!

    # Enhanced search
    searchPosts(
      query: String!
      page: Int = 1
      limit: Int = 10
    ): SearchResponse!

    # Category queries
    categories(
      includeEmpty: Boolean = false
      sortBy: String = "sortOrder"
    ): [Category!]!

    category(id: ID!): Category
    categoryBySlug(slug: String!): Category

    # Tag queries
    tags(
      includeEmpty: Boolean = false
      limit: Int = 100
    ): [Tag!]!

    tag(id: ID!): Tag
    tagBySlug(slug: String!): Tag

    # Dashboard queries
    postsSummary: PostSummary!
    recentPosts(limit: Int = 5): [Post!]!

    # Popular content
    popularPosts(limit: Int = 10): [Post!]!
    popularCategories(limit: Int = 10): [Category!]!
    popularTags(limit: Int = 20): [Tag!]!

    # Analytics (for future implementation)
    postAnalytics(postId: ID!, period: String = "7d"): PostAnalytics
    dashboardStats(period: String = "30d"): DashboardStats
  }

  # Analytics types (for future implementation)
  type PostAnalytics {
    views: Int!
    viewsOverTime: [ViewData!]!
    referrers: [ReferrerData!]!
  }

  type ViewData {
    date: Date!
    views: Int!
  }

  type ReferrerData {
    source: String!
    views: Int!
  }

  type DashboardStats {
    totalViews: Int!
    totalPosts: Int!
    totalCategories: Int!
    totalTags: Int!
    viewsOverTime: [ViewData!]!
    topPosts: [Post!]!
  }

  # Mutations
  type Mutation {
    # Post mutations
    createPost(input: CreatePostInput!): Post!
    updatePost(id: ID!, input: UpdatePostInput!): Post!
    deletePost(id: ID!): Boolean!
    updatePostCategory(postId: ID!, categoryId: ID!): Post

    # Bulk operations
    bulkDeletePosts(ids: [ID!]!): Boolean!
    bulkUpdatePostStatus(ids: [ID!]!, status: PostStatus!): Boolean!
    
    # Publish/unpublish operations
    publishPost(id: ID!): Post!
    unpublishPost(id: ID!): Post!
    
    # Category mutations
    createCategory(input: CreateCategoryInput!): Category!
    updateCategory(id: ID!, input: UpdateCategoryInput!): Category!
    deleteCategory(id: ID!): Boolean!
    
    # Category management
    reorderCategories(categoryOrders: [CategoryOrderInput!]!): Boolean!
    
    # Tag mutations
    createTag(input: CreateTagInput!): Tag!
    updateTag(id: ID!, input: UpdateTagInput!): Tag!
    deleteTag(id: ID!): Boolean!
    
    # Relationship mutations
    updatePostCategories(postId: ID!, categoryIds: [ID!]!): Post!
    updatePostTags(postId: ID!, tagIds: [ID!]!): Post!
    
    # Bulk tag operations
    mergeTags(sourceTagIds: [ID!]!, targetTagId: ID!): Boolean!
    
    # Content operations
    duplicatePost(id: ID!): Post!
    restorePost(id: ID!): Post!
    
    # Import/Export (for future implementation)
    importPosts(data: String!): ImportResult!
    exportPosts(filter: PostFilter): String!
  }

  # Additional input types
  input CategoryOrderInput {
    id: ID!
    sortOrder: Int!
  }

  # Import result type
  type ImportResult {
    success: Boolean!
    imported: Int!
    failed: Int!
    errors: [String!]!
  }

  # Subscriptions (for real-time updates)
  type Subscription {
    postCreated: Post!
    postUpdated(id: ID): Post!
    postDeleted: ID!
    
    categoryCreated: Category!
    categoryUpdated(id: ID): Category!
    categoryDeleted: ID!
    
    # Dashboard real-time updates
    dashboardUpdated: DashboardStats!
  }
`;

module.exports = { typeDefs };

