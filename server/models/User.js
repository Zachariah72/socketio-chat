const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    unique: true,
    match: /^\+?\d{7,15}$/ // Basic phone validation allowing local formats
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  avatar: {
    type: String, // URL or path to avatar
    default: ''
  },
  status: {
    type: String,
    default: 'Hey there! I am using Smiley 😊',
    trim: true
  },
  publicKey: {
    type: String, // For E2E encryption
    default: ''
  },
  online: {
    type: Boolean,
    default: false
  },
  lastSeen: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('User', userSchema);