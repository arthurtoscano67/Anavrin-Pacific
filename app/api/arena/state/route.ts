import { NextResponse } from "next/server";

import {
  currentArenaState,
  removePlayer,
  respondInvite,
  sendInvite,
  updateMatch,
  upsertPlayer,
} from "@/server/arena-hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(currentArenaState());
}

export async function POST(request: Request) {
  const body = (await request.json()) as
    | {
        action: "heartbeat";
        address: string;
        alias?: string;
        selectedMonsterId?: string;
      }
    | {
        action: "leave";
        address: string;
      }
    | {
        action: "invite";
        from: string;
        to: string;
        monsterId?: string;
      }
    | {
        action: "respondInvite";
        id: string;
        accepted: boolean;
      }
    | {
        action: "updateMatch";
        id: string;
        status?: "pending" | "live" | "finished";
        winner?: string;
        onchainMatchId?: string;
        monsterA?: string;
        monsterB?: string;
        addNote?: string;
        addSpectator?: string;
        removeSpectator?: string;
      };

  switch (body.action) {
    case "heartbeat":
      upsertPlayer(body.address, body.alias || body.address, body.selectedMonsterId);
      break;
    case "leave":
      removePlayer(body.address);
      break;
    case "invite":
      sendInvite(body.from, body.to, body.monsterId);
      break;
    case "respondInvite":
      respondInvite(body.id, body.accepted);
      break;
    case "updateMatch":
      updateMatch(body.id, {
        status: body.status,
        winner: body.winner,
        onchainMatchId: body.onchainMatchId,
        monsterA: body.monsterA,
        monsterB: body.monsterB,
        addNote: body.addNote,
        addSpectator: body.addSpectator,
        removeSpectator: body.removeSpectator,
      });
      break;
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  return NextResponse.json(currentArenaState());
}
