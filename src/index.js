'use strict'

export default hype3Translator

var _ = require('lodash')
var path = require('path')
var fs = require('fs-extra')
var XLSX = require('xlsx')

var Entities = require('html-entities').AllHtmlEntities
var entities = new Entities()
var xpath = require('xpath')
var dom = require('xmldom').DOMParser

const ROOT_PATH = 'files'
// const DATA_FILE = 'data.plist'
const INPUT_PATH = path.join(ROOT_PATH, '/input/')
// const OUTPUT_PATH = path.join(ROOT_PATH, '/output/')
const FIRST_ROW = 4 // below headers
var ROW_COUNT = 0
var newPlistFile = ''
const
  columnKeys = {
    'A': 'A',
    'B': 'B',
    'C': 'C'
  }

/**
 * hype3Translator
 * Description
 *
 * @name hype3Translator
 * @function
 * @param none
 *
 * @return Translated file on storage
 */

// export default (data, options) => {}

function hype3Translator () {
  return new Promise((resolve, reject) => {
    let excelFiles = getFiles(['xls', 'xlsx'], INPUT_PATH)
    let hypePlist = getFiles(['plist'], INPUT_PATH)
    let originalPlistFilePath = hypePlist[0] || ''
    let plistFilePath = originalPlistFilePath.replace('.plist', '.plist.bak')

    try {
      fs.removeSync(plistFilePath) // remove .bak, if exists
    } catch (err) {
      console.error(err)
      return reject(err)
    }

    // check for XLSX and .plist valid files
    if (excelFiles.length <= 0 || plistFilePath.length <= 0) { return reject('>> No valid files found!') }

    return excelFiles.map((file) => {
      try {
        var workbook = XLSX.readFile(file)
        newPlistFile = fs.readFileSync(originalPlistFilePath, 'utf8')
        console.log('>> File content loaded: ', originalPlistFilePath)
      } catch (err) {
        return reject(err)
      }

      var firstSheetName = workbook.SheetNames[0]
      var worksheet = workbook.Sheets[firstSheetName]
      var rows = XLSX.utils.sheet_to_row_object_array(worksheet, {raw: true})
      ROW_COUNT = rows.length - 1
      rows = null

      loadTranslationData(worksheet)
      .then((result) => {
        console.log('>> Load translation keys: %s rows', result.length)
        return result
      })
      .then((translations) => {
        return translateFile(translations).then((result) => {
          console.log('>> Translated file: %s bytes', result.length)
          return result
        })
      })
      .then((translatedData) => {
        return persistTranslateFile(plistFilePath, translatedData, (err, result) => {
          console.log('>> Persisted translated file:', result)
          return (err ? reject(err) : resolve())
        })
      })
      .catch((reason) => {
        console.error(reason)
        reject(reason)
      })
    })
  })
}

const loadTranslationData = (worksheet) => {
  ROW_COUNT = (FIRST_ROW + ROW_COUNT)
  let translationBundle = []
  return new Promise((resolve, reject) => {
    for (var rowIndex = FIRST_ROW; rowIndex < ROW_COUNT; rowIndex++) {
      var baseLangStrings = worksheet[columnKeys.B + rowIndex].v // cell value, ENG
      var targetLangStrings = worksheet[columnKeys.C + rowIndex].v // cell value, Foreign Lang
      // remove linebreaks, split by pipe and dot
      translationBundle.push(
        buildTranslationKeys(baseLangStrings, targetLangStrings)
      )
    }
    return resolve(translationBundle)
  })
}

const translateFile = (translations) => {
  return new Promise((resolve, reject) => {
    var doc = new dom().parseFromString(newPlistFile)
    var nodes = xpath.select('//dict[./string[contains(text(), "InnerHTML")]]', doc)

    nodes.forEach((el) => {
      let firstNode = el // nodes[0]
      let strNodes = xpath.select('./string', firstNode)
      let node = strNodes[1]
      let strHtmlDecoded = entities.decode(node.textContent)
      // console.log('\n PROCESS NODE:', strHtmlDecoded)

      if (strHtmlDecoded.length > 1) {
        translations.forEach((translation) => {
          translation.forEach((trx) => {
            if (trx.key.length > 1) {
              // console.log('\n____KEY:', trx.key)
              // console.log('____PAIR:', trx.pair)

              var excelEncodedKey = trx.key.replace(/\r\n/g, '<br>')

              // same key?
              if (strHtmlDecoded.indexOf(excelEncodedKey) > -1) {
                var excelEncodedPair = trx.pair.replace(/\r\n/g, '<br>')

                // APPLY TRANSLATION
                var strHtmlDecodedTranslated = strHtmlDecoded.replace(excelEncodedKey, excelEncodedPair)
                var strHtmlTranslatedEncoded = entities.encode(strHtmlDecodedTranslated)

                console.log('\n >>>>>> KEY MATCH <<<<<< \n\n%s \n\n%s', strHtmlDecoded, excelEncodedKey)
                // console.log('first node', firstNode.toString())
                // console.log('target node', node.textContent.toString())
                // console.log('key html encoded:', excelEncodedKey)
                // console.log('node content     :', strHtmlDecoded)

                // update DOM Node value
                //  http://stackoverflow.com/questions/24885069/nodejs-xmldom-set-dom-value-lost-upon-serialization
                var parentNode = node.parentNode
                parentNode.removeChild(node)
                var newElm = doc.createTextNode(strHtmlTranslatedEncoded) // new translated string
                parentNode.appendChild(newElm)
                // console.log('__Node.translated: ', newElm.textContent)
              }
              // process.exit(0)
            }
          })
        })
      }
    })

    return resolve(doc.toString())
  })
}

const persistTranslateFile = (fileToWrite, newData, cb) => {
  fs.outputFile(fileToWrite, newData, 'utf8', (err) => {
    if (err) return cb(err)
  })
  return cb(null, fileToWrite)
}

/* helpers */
const getTextChuncks = (text) => {
  let textChuncks = []

  // replace linebreaks
  text = text.replace(/(\r\r\n)|(&#10;)/g, '<br>')

  let piped = text.split('|')
  if (piped.length > 1) {
    piped.map((slice) => {
      let dotted = slice.split('.')
      if (dotted.length > 1) {
        dotted.map((phrase) => {
          textChuncks.push(phrase)
        })
      } else {
        textChuncks.push(dotted[0])
      }
    })
  } else {
    textChuncks.push(piped[0])
  }
  return textChuncks
}

const buildTranslationKeys = (source, target) => {
  var outputKeys = []
  var keys = getTextChuncks(source)
  var pairs = getTextChuncks(target)

  if (keys.length === pairs.length) {
    keys.map((row, i) => {
      if (row.length > 0) {
        outputKeys.push({key: row, pair: pairs[i]})
      }
    })
  } else {
    console.log('******* Key/Pair count mismatch! *******')
  }
  return outputKeys
}

const getFiles = (extensions, dir, filelist) => {
  let files = fs.readdirSync(dir)
  filelist = filelist || []
  files.forEach((file) => {
    if (fs.statSync(path.join(dir, file)).isDirectory()) {
      filelist = getFiles(extensions, path.join(dir, file), filelist)
    } else {
      if (extensions.indexOf(file.split('.')[file.split('.').length - 1]) >= 0) {
        filelist.push(path.join(dir, file))
      }
    }
  })
  return filelist
}
