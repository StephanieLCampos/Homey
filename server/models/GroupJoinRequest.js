const mongoose = require('mongoose');

const groupJoinRequestSchema = new mongoose.Schema({
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true
  },
  requester: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  message: {
    type: String,
    maxlength: 500,
    default: ''
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending'
  }
}, { timestamps: true });

groupJoinRequestSchema.index({ groupId: 1, requester: 1 });

module.exports = mongoose.model('GroupJoinRequest', groupJoinRequestSchema);
