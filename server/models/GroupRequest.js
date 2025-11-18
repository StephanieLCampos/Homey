/**
 * GROUP REQUEST MODEL - MongoDB schema for tracking group formation requests
 * Manages requests between users to form groups, including status tracking and timestamps.
 * Handles the workflow of group creation from initial request to acceptance/rejection.
 * Supports pending, accepted, rejected, and expired request states.
 * Links to User documents for requester and recipient with proper validation.
 */
const mongoose = require('mongoose');

const groupRequestSchema = new mongoose.Schema({
  requester: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'expired'],
    default: 'pending'
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  respondedAt: {
    type: Date
  },
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    default: null
  },
  message: {
    type: String,
    maxlength: 500,
    default: ''
  }
}, {
  timestamps: true
});

// Index for efficient queries
groupRequestSchema.index({ requester: 1, recipient: 1 });
groupRequestSchema.index({ recipient: 1, status: 1 });
groupRequestSchema.index({ status: 1, requestedAt: 1 });

// Prevent duplicate requests between same users
groupRequestSchema.index({ requester: 1, recipient: 1, status: 1 }, { unique: true });

module.exports = mongoose.model('GroupRequest', groupRequestSchema);