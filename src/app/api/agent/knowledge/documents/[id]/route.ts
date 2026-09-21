import { auth } from '@clerk/nextjs/server';
import { apiError } from '@/lib/api-error';
import { isUuid } from '@/lib/utils';
import { deleteDocument } from '@/features/knowledge/api/service';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

/** 删除文档：片段由外键 ON DELETE CASCADE 级联清理（删除后不再被检索到） */
export async function DELETE(_request: Request, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return apiError(401, 'unauthorized', 'Unauthorized');
  }
  const { id } = await context.params;
  if (!isUuid(id)) {
    return apiError(404, 'not_found', 'Document not found');
  }

  const deleted = await deleteDocument(userId, id);
  if (!deleted) {
    return apiError(404, 'not_found', 'Document not found');
  }
  return Response.json({ success: true });
}
