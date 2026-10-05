import Room from "../../../components/Room";

type SearchParams = Record<string, string | string[] | undefined>;

type MeetingPageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<SearchParams>;
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MeetingPage({ params, searchParams }: MeetingPageProps) {
  const [{ code }, query] = await Promise.all([params, searchParams]);

  const normalizedCode = code.trim().toUpperCase();

  return (
    <Room
      code={normalizedCode}
      meetingId={first(query.meetingId)}
      hostId={first(query.hostId)}
      userId={first(query.userId)}
      startedAt={first(query.startedAt)}
    />
  );
}
