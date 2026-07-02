import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { convertScreenshotToRenderPng } from '../../server/render.js'

describe('convertScreenshotToRenderPng', () => {
  it('quantizes output to the four e-ink grayscale buckets', async () => {
    const source = Uint8Array.from([0, 96, 160, 255])
    const input = await sharp(Buffer.from(source), {
      raw: {
        width: 4,
        height: 1,
        channels: 1,
      },
    }).png().toBuffer()

    const output = await convertScreenshotToRenderPng(input, {
      width: 4,
      height: 1,
      mode: 'gray4',
    })

    const { data, info } = await sharp(output)
      .greyscale()
      .extractChannel(0)
      .raw()
      .toBuffer({ resolveWithObject: true })
    expect(info.width).toBe(4)
    expect(info.height).toBe(1)

    expect(Array.from(data)).toEqual([0, 85, 170, 255])
  })
})
