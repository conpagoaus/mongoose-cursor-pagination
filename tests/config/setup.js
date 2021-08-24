const {
  MongoMemoryServer
} = require('mongodb-memory-server')
const mongoose = require('mongoose')

require('./models')

let mongoServer

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create()
  await mongoose.connect(mongoServer.getUri(), {
    useNewUrlParser: true,
    useCreateIndex: true,
      useUnifiedTopology: true
  })
})

afterAll(async () => {
   await mongoose.disconnect();
});

// Empty the database before each test
beforeEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map(collection => (
         new Promise((resolve, reject) => {
            collection.deleteMany((err) => {
          if (err) return reject(err)
          resolve()
        })
      })
    ))
  )
})
