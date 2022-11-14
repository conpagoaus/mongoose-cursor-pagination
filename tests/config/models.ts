import mongoose from 'mongoose'
import paginationPlugin from '../../lib'

const CommentSchema = new mongoose.Schema({
   date: { type: Date, default: Date.now, required: true },
   body: { type: String, required: true },
   author: {
      firstName: { type: String, required: true },
      lastName: { type: String, required: true }
   }
})

// Text index for full-text searching
CommentSchema.index({
   body: 'text',
   'author.firstName': 'text',
   'author.lastName': 'text'
})

// Our very own pagination plugin
CommentSchema.plugin(paginationPlugin)

mongoose.model('comment', CommentSchema)
