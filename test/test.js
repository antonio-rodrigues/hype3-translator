import { expect as expect } from 'chai'
import hype3Translator from '../src/index.js'

describe('hype3Translator:', () => {
  it('should be runing without any problems', () => {
    expect(hype3Translator).to.not.throw()
  })
})
