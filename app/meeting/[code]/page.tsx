import Room from "../../../components/Room";

type MeetingPageProps = {
  params: Promise<{ code: string }>;
};

export default async function MeetingPage({ params }: MeetingPageProps) {
  const { code } = await params;

  return <Room code={code} />;
}
