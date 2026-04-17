import { PostComposer } from "@/components/post/post-composer";

export const metadata = {
  title: "Create Post",
  description: "Share your thoughts with your audience",
};

export default function CreatePostPage() {
  return (
    <div className="feed-container min-h-screen">
      <PostComposer />
    </div>
  );
}
