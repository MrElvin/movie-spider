const ProgressBar = require('progress')
var bar = new ProgressBar(':current :bar :token1 :token2', { total: 3 })
bar.tick(1, {
  'token1': "Hello",
  'token2': "World!\n"
})
bar.tick(2, {
  'token1': "Goodbye",
  'token2': "World!"
})