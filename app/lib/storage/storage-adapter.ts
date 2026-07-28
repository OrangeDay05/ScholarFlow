import { env } from "cloudflare:workers";

export type StorageObjectMetadata = {
  objectKey: string;
  size: number;
  etag: string;
  contentType: string | null;
  createdAt: string;
  storageProvider: string;
};

type MaterialR2Object = {
  size: number;
  etag: string;
  httpMetadata?: { contentType?: string };
  uploaded?: Date;
};

type MaterialR2ObjectBody = MaterialR2Object & {
  arrayBuffer(): Promise<ArrayBuffer>;
};

export interface MaterialR2Bucket {
  put(
    key: string,
    body: ArrayBuffer,
    options: {
      httpMetadata: { contentType: string };
      customMetadata: { contentHash: string };
    },
  ): Promise<MaterialR2Object>;
  head(key: string): Promise<MaterialR2Object | null>;
  get(key: string): Promise<MaterialR2ObjectBody | null>;
  delete(key: string): Promise<void>;
}

export interface StorageAdapter {
  readonly provider: string;
  put(
    key: string,
    body: ArrayBuffer,
    options: { contentType: string; contentHash: string },
  ): Promise<StorageObjectMetadata>;
  head(key: string): Promise<StorageObjectMetadata | null>;
  exists(key: string): Promise<boolean>;
  get(key: string): Promise<ArrayBuffer | null>;
  delete(key: string): Promise<void>;
}

export class InMemoryStorageAdapter implements StorageAdapter {
  readonly provider = "IN_MEMORY";
  private readonly objects = new Map<
    string,
    { body: ArrayBuffer; metadata: StorageObjectMetadata }
  >();

  async put(
    key: string,
    body: ArrayBuffer,
    options: { contentType: string; contentHash: string },
  ): Promise<StorageObjectMetadata> {
    if (this.objects.has(key)) {
      throw new Error("Storage object keys are immutable.");
    }
    const metadata = {
      objectKey: key,
      size: body.byteLength,
      etag: options.contentHash,
      contentType: options.contentType,
      createdAt: new Date().toISOString(),
      storageProvider: this.provider,
    };
    this.objects.set(key, { body: body.slice(0), metadata });
    return metadata;
  }

  async head(key: string): Promise<StorageObjectMetadata | null> {
    return this.objects.get(key)?.metadata ?? null;
  }

  async get(key: string): Promise<ArrayBuffer | null> {
    return this.objects.get(key)?.body.slice(0) ?? null;
  }

  async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

export class LocalDevelopmentObjectStorageAdapter implements StorageAdapter {
  readonly provider = "LOCAL_R2";
  private readonly bucket: MaterialR2Bucket;

  constructor(bucket: MaterialR2Bucket) {
    this.bucket = bucket;
  }

  async put(
    key: string,
    body: ArrayBuffer,
    options: { contentType: string; contentHash: string },
  ): Promise<StorageObjectMetadata> {
    const existing = await this.bucket.head(key);
    if (existing) throw new Error("Storage object keys are immutable.");
    const stored = await this.bucket.put(key, body, {
      httpMetadata: { contentType: options.contentType },
      customMetadata: { contentHash: options.contentHash },
    });
    return toMetadata(key, stored, this.provider);
  }

  async head(key: string): Promise<StorageObjectMetadata | null> {
    const object = await this.bucket.head(key);
    return object ? toMetadata(key, object, this.provider) : null;
  }

  async get(key: string): Promise<ArrayBuffer | null> {
    const object = await this.bucket.get(key);
    return object ? object.arrayBuffer() : null;
  }

  async exists(key: string): Promise<boolean> {
    return (await this.bucket.head(key)) !== null;
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }
}

export function getMaterialStorageAdapter(): StorageAdapter {
  const bucket = (env as { MATERIALS?: MaterialR2Bucket }).MATERIALS;
  if (!bucket) {
    throw new Error(
      "MATERIALS R2 binding is unavailable. Start local development with M5_LOCAL_OBJECT_STORAGE=true.",
    );
  }
  return new LocalDevelopmentObjectStorageAdapter(bucket);
}

function toMetadata(
  key: string,
  object: MaterialR2Object,
  storageProvider: string,
): StorageObjectMetadata {
  return {
    objectKey: key,
    size: object.size,
    etag: object.etag,
    contentType: object.httpMetadata?.contentType ?? null,
    createdAt: object.uploaded?.toISOString() ?? new Date().toISOString(),
    storageProvider,
  };
}
