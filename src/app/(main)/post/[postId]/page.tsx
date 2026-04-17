import { PostDetailContent } from "@/components/post/post-detail";

interface PostDetailPageProps {
  params: Promise<{ postId: string }>;
}

export default async function PostDetailPage({ params }: PostDetailPageProps) {
  const { postId } = await params;

  return (
    <div className="feed-container">
      <PostDetailContent postId={postId} />
    </div>
  );
}
