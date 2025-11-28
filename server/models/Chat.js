const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['individual', 'group'],
    required: true
  },
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  name: {
    type: String,
    trim: true,
    default: ''
  },
  avatar: {
    type: String,
    default: ''
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  settings: {
    wallpaper: {
      type: String,
      default: ''
    },
    theme: {
      type: String,
      default: 'default'
    }
  },
  encryptionKey: {
    type: String, // Encrypted symmetric key for E2E
    default: ''
  }
}, {
  timestamps: true
});

// For individual chats, ensure only 2 participants
chatSchema.pre('save', function(next) {
  if (this.type === 'individual' && this.participants.length !== 2) {
    return next(new Error('Individual chats must have exactly 2 participants'));
  }
  next();
});

module.exports = mongoose.model('Chat', chatSchema);