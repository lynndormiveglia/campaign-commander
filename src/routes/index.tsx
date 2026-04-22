import { createFileRoute } from "@tanstack/react-router";
import CampaignSimulator from "@/components/campaign/CampaignSimulator";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return <CampaignSimulator />;
}
