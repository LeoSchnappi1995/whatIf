import { WhatifService } from './whatif.service';

describe('WhatifService bundled character references', () => {
  it('uploads a bundled character asset and returns a signed URL for Seedance', async () => {
    const files = {
      upload: jest.fn().mockResolvedValue({ filePath: '/uploaded/builtin-linxia.png' }),
      createSignedUrl: jest.fn().mockResolvedValue('https://cdn.example.com/builtin-linxia.png'),
    };
    const service = new WhatifService(undefined as never, files as never, undefined as never) as WhatifService & {
      modelReference(value: unknown): Promise<string>;
    };

    const result = await service.modelReference('assets/whatif/generated-cast/linxia.png');

    expect(files.upload).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ fileName: 'whatif-builtin-linxia.png', contentType: 'image/png' }),
    );
    expect(files.createSignedUrl).toHaveBeenCalledWith('/uploaded/builtin-linxia.png', 60 * 60 * 24 * 7);
    expect(result).toBe('https://cdn.example.com/builtin-linxia.png');
  });
});
