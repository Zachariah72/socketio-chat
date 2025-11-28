const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  chatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    required: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['text', 'image', 'file', 'system'],
    default: 'text'
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  status: {
    sent: {
      type: Boolean,
      default: true
    },
    delivered: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    read: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }]
  },
  reactions: {
    type: Map,
    of: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    default: {}
  },
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  edited: {
    type: Boolean,
    default: false
  },
  editedAt: Date
}, {
  timestamps: true
});

// Index for efficient querying
messageSchema.index({ chatId: 1, timestamp: -1 });

module.exports = mongoose.model('Message', messageSchema);