import { describe, expect, it } from 'vitest'
import { albumPictures, playOrder, type MediaNode } from '../src/slideshow'
import { withAlbum } from '../src/album-picker'

const pic = (title: string, id = title): MediaNode => ({ title, media_content_id: id, media_class: 'image', media_content_type: 'image/jpeg' })

describe('albumPictures', () => {
  it('keeps the pictures, without videos, folders and the second copy of a RAW + JPEG pair', () => {
    const album: MediaNode = { title: 'Italien', media_content_id: 'a', children: [
      pic('PXL_1.jpg', 'x1'), pic('PXL_1.jpg', 'x2'),
      { title: 'PXL_2.mp4', media_content_id: 'v', media_class: 'video', media_content_type: 'video/mp4' },
      { title: 'Unterordner', media_content_id: 'f', media_class: 'directory', can_expand: true },
      { title: 'scan.png', media_content_id: 's', media_content_type: 'image/png' },
      pic('PXL_1.jpg', 'x3'),
    ] }
    expect(albumPictures(album).map(p => p.media_content_id)).toEqual(['x1', 's', 'x3'])
    expect(albumPictures(undefined)).toEqual([])
  })
})

describe('playOrder', () => {
  it('goes through every picture once, shuffled or as they come', () => {
    expect(playOrder(4, false)).toEqual([0, 1, 2, 3])
    const shuffled = playOrder(50, true)
    expect([...shuffled].sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i))
    expect(shuffled).not.toEqual(playOrder(50, false))
    expect(playOrder(0, true)).toEqual([])
  })
})

describe('withAlbum', () => {
  it('sets the album and keeps its settings; without one they go too', () => {
    const face = { style: 'photo' as const, after: 60, album: 'old', interval: 10, shuffle: false }
    expect(withAlbum(face, 'new')).toEqual({ style: 'photo', after: 60, album: 'new', interval: 10, shuffle: false })
    expect(withAlbum(face, undefined)).toEqual({ style: 'photo', after: 60 })
  })
})
