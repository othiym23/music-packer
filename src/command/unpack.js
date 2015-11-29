import { writeFile as writeFileCB } from 'graceful-fs'
import { join, resolve } from 'path'
import { randomBytes } from 'crypto'
import { tmpdir } from 'os'

import globCB from 'glob'
import log from 'npmlog'
import rimrafCB from 'rimraf'
import untildify from 'untildify'
import { promisify } from 'bluebird'
import Bluebird from 'bluebird'

import albumsFromFLACTracks from '../flac/albums-from-tracks.js'
import makePlaylist from '../utils/make-playlist.js'
import { place, moveToArchive } from '../mover.js'
import { extractRelease } from '../metadata/index.js'

const glob = promisify(globCB)
const rimraf = promisify(rimrafCB)
const writeFile = promisify(writeFileCB)

const covers = new Map()
const tmp = join(tmpdir(), 'packard-' + randomBytes(8).toString('hex'))

export default function unpack (target, staging, archiveRoot, playlist) {
  log.enableProgress()
  const groups = new Map()
  let locate = Bluebird.resolve(target.files)
  if (target.roots && target.roots[0] && target.pattern) {
    locate = locate.then(files => {
      log.verbose('unpack', 'initial files', files)
      return glob(join(untildify(target.roots[0]), target.pattern))
        .then(globbed => {
          const full = files.concat(globbed)
          log.verbose('unpack', 'globbed files', full)
          if (!archiveRoot) return full
          // don't reprocess stuff that's already been archived
          return full.filter(f => resolve(f).indexOf(resolve(archiveRoot)) === -1)
        })
    })
  }

  locate = locate.then(files => {
    if (files.length === 0) {
      log.info('unpack', 'no archives to process! CU L8R SAILOR')
      log.disableProgress()
      process.exit(0)
    }

    log.verbose('unpack', 'processing', files)
    files.forEach(f => groups.set(f, log.newGroup('process: ' + f)))
    return Bluebird.map(
      files,
      f => extractRelease(f, tmp, covers, groups),
      {concurrency: 2}
    )
  }).then(m => {
    return place(albumsFromFLACTracks(m, covers), staging, groups)
  }).then(placed => {
    if (!archiveRoot) return Bluebird.resolve(placed)
    return moveToArchive(placed, archiveRoot, groups).then(() => placed)
  }).then(albums => {
    log.disableProgress()
    report(albums, staging)
    if (archiveRoot) reportArchived(albums)
    log.verbose('removing', tmp)
    return rimraf(tmp).then(() => albums)
  })

  if (playlist) {
    locate = locate.then(albums => {
      return writeFile(untildify(playlist), makePlaylist(albums), 'utf-8')
    })
  }

  return locate
}

function report (albums, root, archives, archiveRoot) {
  const sorted = [...albums].sort((first, second) => {
    let result = first.getDate().localeCompare(second.getDate())
    if (result !== 0) return result

    return first.toSafePath().toLowerCase().localeCompare(second.toSafePath().toLowerCase())
  })

  console.log('new albums from this run:\n')
  for (let album of sorted) console.log(join(root, album.toSafePath()))

  console.log('\nfull details:\n')
  for (let album of sorted) console.log(album.dump())
}

function reportArchived (albums) {
  const archived = [...albums].filter(a => a.destArchive)
  if (archived.length === 0) return

  console.log('now archived:\n')
  for (let album of archived) {
    console.log(album.sourceArchive.path, '\n  ->', album.destArchive.path)
  }
}