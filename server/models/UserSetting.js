const mongoose = require('mongoose');

const userSettingSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  key: {
    type: String,
    required: true,
    enum: ['theme', 'wallpaper', 'notificationSound', 'privacy.lastSeen', 'privacy.profilePhoto', 'privacy.status']
  },
  value: {
    type: mongoose.Schema.Types.Mixed, // Can be string, boolean, etc.
    required: true
  }
}, {
  timestamps: true
});

// Compound index for efficient lookup
userSettingSchema.index({ userId: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('UserSetting', userSettingSchema);