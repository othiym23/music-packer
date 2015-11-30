import { extname } from 'path'

import flacReader from './flac/reader.js'
import { reader as mp3Reader } from '../mp3/scan.js'
import m4aReader from './m4a/reader.js'

export default function reader (path, progressGroups, extras, onFinish, onError) {
  switch (extname(path)) {
    case '.flac':
      return flacReader(path, progressGroups, extras, onFinish, onError)
    case '.mp3':
      return mp3Reader(path, progressGroups, extras, onFinish, onError)
    case '.m4a':
      return m4aReader(path, progressGroups, extras, onFinish, onError)
    default:
      throw new TypeError('Unknown file type for ' + path)
  }
}
