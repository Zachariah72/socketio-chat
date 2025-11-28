const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  contactUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  customName: {
    type: String,
    trim: true,
    default: ''
  },
  addedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound index to prevent duplicate contacts
contactSchema.index({ userId: 1, contactUserId: 1 }, { unique: true });

module.exports = mongoose.model('Contact', contactSchema);