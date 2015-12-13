var createReadStream = require('fs').createReadStream
var createWriteStream = require('fs').createWriteStream
var path = require('path')
var spawn = require('child_process').spawn

var whichCB = require('which')
var Bluebird = require('bluebird')

var promisify = Bluebird.promisify
var mkdirp = promisify(require('mkdirp'))
var which = promisify(whichCB)

var EMPTY_TRACK = path.resolve(__dirname, '../fixtures/empty.mp3')

// I'm not writing a JS ID3v2.4 editor this week
function eye (path, tags) {
  var args = [
    '--no-color',
    '--v2',
    '--to-v2.4',
    '--force-update'
  ]

  Object.keys(tags).forEach(function (k) {
    switch (k) {
      case 'title':
        args.push('--title')
        args.push(tags[k])
        break
      case 'artist':
        args.push('--artist')
        args.push(tags[k])
        break
      case 'album':
        args.push('--album')
        args.push(tags[k])
        break
      case 'track':
        args.push('--track')
        args.push(tags[k])
        break
      case 'date':
        args.push('--release-date')
        args.push(tags[k])
        break
      case 'genre':
        args.push('-G')
        args.push(tags[k])
    }
  })

  return which('eyeD3').then(function (bin) {
    return new Bluebird(function (resolve, reject) {
      var child = spawn(bin, args.concat(path), { encoding: 'utf8' })

      var stdout = ''
      if (child.stdout) {
        child.stdout.on('data', function (chunk) {
          stdout += chunk
        })
      }

      var stderr = ''
      if (child.stderr) {
        child.stderr.on('data', function (chunk) {
          stderr += chunk
        })
      }

      child.on('error', reject)
      child.on('close', function (code) {
        if (code !== 0) return reject(new Error(stderr))
        resolve(stdout, stderr)
      })
    })
  })
}

function makeAlbum (root, tracks) {
  return Bluebird.map(tracks, makeTrack.bind(null, root))
}

function makeTrack (root, track) {
  return mkdirp(path.dirname(track.file.path)).then(function () {
    return new Bluebird(function (resolve, reject) {
      createReadStream(EMPTY_TRACK)
        .on('error', reject)
        .pipe(createWriteStream(track.file.path))
        .on('error', reject)
        .on('finish', function () {
          var tags = {
            title: track.name,
            artist: track.artist.name,
            album: track.album.name,
            track: track.index,
            date: track.date
          }
          if (track.tags && track.tags.genre) tags.genre = track.tags.genre

          eye(track.file.path, tags).return(track.file.path).then(resolve)
        })
    })
  })
}

module.exports = { makeAlbum: makeAlbum, makeTrack: makeTrack }
