#!/usr/bin/env node

import 'babel-polyfill'

import log from 'npmlog'
import untildify from 'untildify'

// don't log the config until the log level is set
import config from './config/default.js'
import options from './config/options.js'

import albums from './command/albums.js'
import artists from './command/artists.js'
import audit from './command/audit.js'
import inspect from './command/inspect.js'
import makePlaylist from './utils/make-playlist.js'
import optimize from './command/optimize.js'
import saveConfig from './config/save.js'
import scanAlbums from './albums.js'
import unpack from './unpack.js'

import { promisify } from 'bluebird'
import { writeFile as writeFileCB } from 'graceful-fs'
const writeFile = promisify(writeFileCB)

const yargs = require('yargs')
                .usage('Usage: $0 [options] <command>')
                .command('albums', 'print a list of albums in human-readable format')
                .command('artists', 'generate a list of artists from roots')
                .command('audit', 'check metadata for inconsistencies')
                .command('inspect', 'dump all the metadata from a track or album')
                .command('pls', 'print a list of albums as a .pls file, sorted by date')
                .command('unpack', 'unpack a set of zipped files into a staging directory')
                .options({
                  S: options.S,
                  loglevel: options.loglevel
                })
                .help('h')
                .alias('h', 'help')
                .version(() => require('../package').version)
                .demand(1)

log.level = yargs.argv.loglevel
log.verbose('config', config)

let argv, command, roots, files
const groups = new Map()
switch (yargs.argv._[0]) {
  case 'albums':
    argv = yargs.reset()
                .usage('Usage: $0 [options] albums [-R dir [file...]]')
                .options({
                  R: options.R
                })
                .check(argv => {
                  if (argv._.length > 1 || (argv.R && argv.R.length)) return true

                  return 'Must pass 1 or more audio files or directory trees.'
                })
                .argv
    roots = argv.R.map(r => untildify(r))
    log.silly('albums', 'argv', argv)

    command = albums(argv._.slice(1), argv.R, groups)
    break
  case 'artists':
    options.R.required = '- Must have at least one tree to scan.'
    argv = yargs.reset()
                .usage('Usage: $0 artists [-R dir [-R dir...]]')
                .options({
                  R: options.R
                })
                .argv
    roots = argv.R.map(r => untildify(r))
    log.silly('artists', 'argv', argv)

    command = artists(roots, groups)
    break
  case 'audit':
    argv = yargs.reset()
                .usage('Usage: $0 audit [file [file...]]')
                .check(argv => {
                  if (argv._.length > 1) return true

                  return 'must pass either 1 or more files containing metadata'
                })
                .argv
    files = argv._.slice(1).map(f => untildify(f))
    log.silly('audit', 'argv', argv)

    command = audit(files, groups)
    break
  case 'inspect':
    argv = yargs.reset()
                .usage('Usage: $0 [options] inspect [file [dir...]]')
                .demand(2)
                .argv

    files = argv._.slice(1).map(f => untildify(f))
    log.silly('audit', 'argv', argv)

    command = inspect(files, groups)
    break
  case 'optimize':
    argv = yargs.reset()
                .usage('Usage: $0 [options] optimize -O blocks [-R dir [file...]]')
                .options({
                  B: options.B,
                  O: options.O,
                  R: options.R
                })
                .check(argv => {
                  if (argv._.length > 1 || (argv.R && argv.R.length)) return true

                  return 'Must pass 1 or more audio files or directory trees.'
                })
                .argv
    files = argv._.slice(1).map(f => untildify(f))
    roots = argv.R.map(r => untildify(r))
    log.silly('optimize argv', argv)

    command = optimize(files, roots, argv.S, argv.O, groups)
    break
  case 'pls':
    options.R.required = '- Must have at least one tree to scan.'
    argv = yargs.reset()
                .usage('Usage: $0 [options] pls [-R dir [-R dir...]]')
                .options({
                  R: options.R
                })
                .argv
    roots = argv.R.map(r => untildify(r))
    log.silly('pls', 'argv', argv)

    log.enableProgress()
    command = scanAlbums(roots, groups).then(sorted => console.log(makePlaylist(sorted)))
    break
  case 'unpack':
    options.R.describe = 'root directory containing zipped files'
    argv = yargs.reset()
                .usage('Usage: $0 [options] unpack [zipfile [zipfile...]]')
                .options({
                  R: options.R,
                  P: options.P,
                  s: options.s,
                  archive: options.archive,
                  'archive-root': options.archiveRoot,
                  playlist: options.playlist
                })
                .check(argv => {
                  if (argv._.length > 1 || (argv.R && argv.R.length && argv.P)) return true

                  return 'Must pass either 1 or more zipfiles, or root and glob pattern.'
                })
                .argv
    files = argv._.slice(1).map(f => untildify(f))
    roots = (argv.R || []).map(r => untildify(r))
    log.silly('unpack argv', argv)

    command = unpack(
      files,
      argv.s,
      roots[0], argv.P,
      argv.archive, argv.archiveRoot
    )
    if (argv.playlist) {
      command = command.then(albums => {
        return writeFile(untildify(argv.playlist), makePlaylist(albums), 'utf-8')
      })
    }
    break
  default:
    yargs.showHelp()
    process.exit(1)
}

if (argv.saveConfig) command = command.then(() => saveConfig(argv))
command.then(() => {
  log.silly('packard', 'tracker debugging', log.tracker.debug())
}).catch(e => {
  log.disableProgress()
  log.error('packard', e.stack)
})
