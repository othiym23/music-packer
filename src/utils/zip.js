const Promise = require('bluebird')

const promisify = Promise.promisify

const {createHash} = require('crypto')
const {createWriteStream} = require('fs')
const {join, basename, dirname} = require('path')

const log = require('npmlog')
const mkdirp = promisify(require('mkdirp'))
const openZip = promisify(require('yauzl').open)

function unpack (sourceArchive, groups, directory) {
  log.silly('unpack', 'unpacking', sourceArchive)
  const path = join(directory, createHash('sha1').update(sourceArchive).digest('hex'))
  const group = groups.get(sourceArchive)
  return mkdirp(path).then(() => new Promise((resolve, reject) => {
    log.verbose('unpack', 'made', path)
    openZip(sourceArchive, {autoClose: false}).then(zf => {
      log.verbose('unpack', 'unpacking up to', zf.entryCount, 'entries')
      const entries = []

      const tracker = group.newItem(
        'scanning: ' + basename(sourceArchive),
        zf.entryCount,
        1
      )

      zf.on('error', reject)
      zf.on('entry', entry => {
        tracker.completeWork(1)

        if (/\/$/.test(entry.fileName)) {
          log.silly('unpack', 'skipping directory', entry.fileName)
          return
        }

        groups.set(
          basename(entry.fileName),
          group.newGroup('extract: ' + entry.fileName)
        )
        entries.push(entry)
      })
      zf.on('end', () => {
        Promise.map(entries, zipData => new Promise((resolve, reject) => {
          log.silly('unpack', 'zipData', zipData)

          const fullPath = join(path, zipData.fileName)
          const writeTracker = groups.get(basename(zipData.fileName)).newStream(
            'writing: ' + zipData.fileName,
            zipData.uncompressedSize,
            3
          )

          zf.openReadStream(zipData, function (err, zipstream) {
            if (err) {
              log.error('unpack', 'reading stream', err.stack)
              return reject(err)
            }

            log.verbose('unpack', 'creating directory', dirname(fullPath))
            mkdirp(dirname(fullPath)).then(() => {
              log.verbose('unpack', 'writing', fullPath, zipData.uncompressedSize)
              zipstream
                .pipe(writeTracker)
                .pipe(createWriteStream(fullPath))
                .on('error', reject)
                .on('finish', () => {
                  log.verbose('unpack', 'finished writing', fullPath)
                  resolve({ sourceArchive, zipData, path: fullPath })
                })
            })
          })
        }), {concurrency: 1}).then(paths => {
          log.silly('unpack', 'unpacked', sourceArchive, 'to', paths)
          resolve(paths)
        })
      })
    }).catch(reject)
  }))
}

module.exports = { unpack }
