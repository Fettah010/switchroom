// Switchroom v0.7.0 E2E Tests: Direct-to-R2 Multipart Uploads & Storage Reservation
import { test, expect, type APIRequestContext } from '@playwright/test';

const API = 'http://127.0.0.1:4173';

async function createProject(
  request: APIRequestContext,
): Promise<{ id: string; guestCapability: string }> {
  const res = await request.post(`${API}/api/projects`, {
    data: { title: 'Multipart Upload E2E' },
  });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as {
    project: { id: string };
    guestCapability: string;
  };
  return { id: body.project.id, guestCapability: body.guestCapability };
}

test.describe('Switchroom v0.7.0 Direct-to-R2 Resumable Multipart Uploads', () => {
  test('E2E-MULTIPART-01: file >= 50 MB uses multipart strategy, completes with ETags and updates storage reservation', async ({
    request,
  }) => {
    const project = await createProject(request);

    // 55 MB file triggers multipart strategy (threshold is 50 MB)
    const testSizeBytes = 55 * 1024 * 1024;

    const initRes = await request.post(`${API}/api/uploads/init`, {
      data: {
        projectId: project.id,
        role: 'original',
        filename: 'large_orchestral_master.wav',
        sizeBytes: testSizeBytes,
        mimeType: 'audio/wav',
      },
    });

    expect(initRes.ok()).toBeTruthy();
    const initData = (await initRes.json()) as {
      strategy: string;
      uploadSessionId: string;
      multipartUploadId?: string;
      partSize?: number;
      totalParts?: number;
    };

    expect(initData.strategy).toBe('multipart');
    expect(initData.multipartUploadId).toBeDefined();
    expect(initData.totalParts).toBeGreaterThan(1);
    expect(initData.partSize).toBeGreaterThan(0);

    const sessionId = initData.uploadSessionId;
    const totalParts = initData.totalParts!;
    const partSize = initData.partSize!;

    // Verify storage reservation is active
    const storageRes = await request.get(`${API}/api/projects/${project.id}/storage-summary`);
    expect(storageRes.ok()).toBeTruthy();
    const storageData = (await storageRes.json()) as {
      storage: { committedBytes: number; reservedBytes: number; totalUsageBytes: number };
    };
    expect(storageData.storage.reservedBytes).toBe(testSizeBytes);
    expect(storageData.storage.committedBytes).toBe(0);

    // Upload each part
    const completedParts: Array<{ partNumber: number; etag: string }> = [];

    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      // 1. Get part URL
      const partUrlRes = await request.get(
        `${API}/api/uploads/multipart/${sessionId}/part-url?partNumber=${partNumber}`,
      );
      expect(partUrlRes.ok()).toBeTruthy();
      const { uploadUrl } = (await partUrlRes.json()) as { uploadUrl: string };

      // 2. Upload part data to R2 (>= 5 MiB per S3/R2 specification)
      const currentPartBytes =
        partNumber === totalParts ? testSizeBytes - (totalParts - 1) * partSize : partSize;
      const dummyChunk = Buffer.alloc(currentPartBytes);

      const putRes = await request.put(uploadUrl, {
        data: dummyChunk,
        headers: { 'Content-Type': 'audio/wav' },
      });
      expect(putRes.ok()).toBeTruthy();
      const etag = putRes.headers()['etag'] || `"etag-part-${partNumber}"`;

      // 3. Record completed part
      const recordRes = await request.post(
        `${API}/api/uploads/multipart/${sessionId}/part-complete`,
        {
          data: {
            partNumber,
            etag,
            sizeBytes: currentPartBytes,
          },
        },
      );
      expect(recordRes.ok()).toBeTruthy();

      completedParts.push({ partNumber, etag });
    }

    // List parts to verify ledger
    const listRes = await request.get(`${API}/api/uploads/multipart/${sessionId}/parts`);
    expect(listRes.ok()).toBeTruthy();
    const listData = (await listRes.json()) as {
      parts: Array<{ partNumber: number; etag: string }>;
    };
    expect(listData.parts.length).toBe(totalParts);

    // Complete multipart upload session
    const completeRes = await request.post(`${API}/api/uploads/multipart/${sessionId}/complete`, {
      data: { parts: completedParts },
    });
    expect(
      completeRes.ok(),
      `complete multipart: ${completeRes.status()} ${await completeRes.text()}`,
    ).toBeTruthy();
    const completeData = (await completeRes.json()) as {
      success: boolean;
      status: string;
      asset: { status: string; size_bytes: number };
    };
    expect(completeData.success).toBe(true);
    expect(completeData.asset.status).toBe('ready');
    expect(completeData.asset.size_bytes).toBe(testSizeBytes);

    // Verify storage accounting moved reserved bytes into committed bytes
    const afterStorageRes = await request.get(`${API}/api/projects/${project.id}/storage-summary`);
    expect(afterStorageRes.ok()).toBeTruthy();
    const afterStorage = (await afterStorageRes.json()) as {
      storage: { committedBytes: number; reservedBytes: number; totalUsageBytes: number };
    };
    expect(afterStorage.storage.reservedBytes).toBe(0);
    expect(afterStorage.storage.committedBytes).toBe(testSizeBytes);
  });

  test('E2E-MULTIPART-02: aborting/cancelling multipart upload releases storage reservation', async ({
    request,
  }) => {
    const project = await createProject(request);
    const testSizeBytes = 60 * 1024 * 1024;

    const initRes = await request.post(`${API}/api/uploads/init`, {
      data: {
        projectId: project.id,
        role: 'edited',
        filename: 'heavy_mixdown.wav',
        sizeBytes: testSizeBytes,
        mimeType: 'audio/wav',
      },
    });

    expect(initRes.ok()).toBeTruthy();
    const { uploadSessionId } = (await initRes.json()) as { uploadSessionId: string };

    // Verify bytes reserved
    const initialStorage = await request.get(`${API}/api/projects/${project.id}/storage-summary`);
    const s1 = ((await initialStorage.json()) as { storage: { reservedBytes: number } }).storage;
    expect(s1.reservedBytes).toBe(testSizeBytes);

    // Cancel / Abort session
    const abortRes = await request.post(`${API}/api/uploads/${uploadSessionId}/cancel`);
    expect(abortRes.ok()).toBeTruthy();

    // Verify bytes reservation released
    const afterStorage = await request.get(`${API}/api/projects/${project.id}/storage-summary`);
    const s2 = ((await afterStorage.json()) as { storage: { reservedBytes: number } }).storage;
    expect(s2.reservedBytes).toBe(0);
  });
});
