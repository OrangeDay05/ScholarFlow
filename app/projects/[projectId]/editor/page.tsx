import EditorClient from "./EditorClient";

type EditorPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function EditorPage({ params }: EditorPageProps) {
  const { projectId } = await params;
  return <EditorClient projectId={projectId} />;
}
