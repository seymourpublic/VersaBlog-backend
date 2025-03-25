// graphql/resolvers.js
const Post = require('../models/Post');
const Image = require('../models/Image');
const Tag = require('../models/Tag');

const resolvers = {
  Query: {
    posts: async () => await Post.find({}),
    post: async (_, { id }) => await Post.findById(id),
  },
  Mutation: {
    createPost: async (_, args) => {
      const post = new Post(args);
      return await post.save();
    },
    updatePost: async (_, { id, ...updates }) => {
      // Increment version on each update
      const post = await Post.findByIdAndUpdate(
        id,
        { ...updates, $inc: { version: 1 }, updatedAt: Date.now() },
        { new: true }
      );
      return post;
    },
    deletePost: async (_, { id }) => {
      await Post.findByIdAndDelete(id);
      return true;
    },
  },
  Post: {
    // Resolve images associated with the post.
    images: async (parent) => await Image.find({ postId: parent.id }),
    // You can implement similar resolvers for tags.
  },
};

module.exports = { resolvers };
