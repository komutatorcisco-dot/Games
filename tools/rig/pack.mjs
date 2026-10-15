import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, textureCompress, prune, dedup, resample } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(process.argv[2]);
const mat = doc.getRoot().listMaterials()[0];
const color = mat.getBaseColorTexture();
await doc.transform(dedup(), prune(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [2048, 2048], quality: 86, slots: /baseColor/ }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 80, slots: /^(?!baseColor)/ }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(process.argv[3], doc);
for (const t of doc.getRoot().listTextures()) console.log(t.getMimeType(), t.getSize(), (t.getImage().byteLength/1024|0)+'KB');
