var relative = require('path').relative
var join = require('path').join

var Bluebird = require('bluebird')
var promisify = Bluebird.promisify
var glob = promisify(require('glob'))
var mkdirp = promisify(require('mkdirp'))
var rimraf = promisify(require('rimraf'))

var test = require('tap').test

var cli = require('./lib/cli.js')
var metadata = require('./lib/metadata.js')

var p = join(__dirname, '../lib/cli.js')
var r = relative(process.cwd(), p)

var lines = function () {/*

must pass either 1 or more files containing metadata
*/}.toString().split('\n').slice(1, -1)

var prolog = 'Usage: ' + r + ' audit [file [file...]]'

var root = join(__dirname, 'cli-audit')
var flacRoot = join(root, 'flac')
var albumRoot = join(flacRoot, 'Gary Beck', 'Feel It')

test('setup', function (t) {
  rimraf(root).then(function () {
    return mkdirp(root)
  }).then(function () {
    t.end()
  })
})

test('packard audit', function (t) {
  var expected = [prolog].concat(lines).join('\n')
  cli.pnixt()
    .run('node ' + p + ' audit')
    .expect(function (r) {
      var trimmed = r.stderr
                     .split('\n')
                     .map(function (l) { return l.replace(/\s+$/, '') })
                     .join('\n')
      t.equal(trimmed, expected, '"packard" is missing a required parameter')
    })
    .code(1)
    .end(function (e) {
      t.ifError(e, 'no error on exit')
      t.end()
    })
})

test('packard audit ' + root + '/**/*.flac', function (t) {
  rimraf(root).then(function () {
    return metadata.makeAlbum(
      albumRoot,
      '2012-01-20',
      'Gary Beck',
      'Feel It',
      [
        { name: 'Feel It' },
        { name: 'Paid Out' },
        { name: 'Hillview' }
      ]
    )
  }).then(function () {
    return glob(root + '/**/*.flac')
  }).then(function (files) {
    cli.pnixt()
      .run('node ' + p + ' audit ' + files.map(function (f) {
        return '"' + f + '"'
      }).join(' '))
      .expect(function (r) {
        t.match(r.stderr, 'Gary Beck: Feel It / Gary Beck - Feel It: has no genre set')
        t.match(r.stderr, 'Gary Beck: Feel It / Gary Beck - Paid Out: has no genre set')
        t.match(r.stderr, 'Gary Beck: Feel It / Gary Beck - Hillview: has no genre set')
        t.equal(r.stdout, '')
      })
      .code(0)
      .end(function (e) {
        t.ifError(e, 'no error on exit')
        t.end()
      })
  })
})

test('cleanup', function (t) {
  rimraf(root).then(function () {
    t.end()
  })
})
