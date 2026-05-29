import { LaunchDemoScreen } from "@/features/demo/launch-demo-screen";

type LaunchDemoPageProps = {
  searchParams: Promise<{ scene?: string }>;
};

export default async function LaunchDemoPage({ searchParams }: LaunchDemoPageProps) {
  const params = await searchParams;
  return <LaunchDemoScreen scene={params.scene} />;
}
