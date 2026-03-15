import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSuiClient } from "@mysten/dapp-kit";

import { MartianGifCard } from "../components/MartianGifCard";
import { LoadingGrid } from "../components/LoadingGrid";
import { PageShell } from "../components/PageShell";
import { fetchMintedMonsters } from "../lib/sui";

const PAGE_SIZE = 24;

export function GalleryPage() {
  const client = useSuiClient();
  const [page, setPage] = useState(1);

  const gallery = useQuery({
    queryKey: ["mintedMartians"],
    queryFn: () => fetchMintedMonsters(client),
    refetchInterval: 30_000,
  });

  const totalPages = useMemo(() => {
    const total = gallery.data?.length ?? 0;
    return Math.max(1, Math.ceil(total / PAGE_SIZE));
  }, [gallery.data]);

  const visible = useMemo(() => {
    const items = gallery.data ?? [];
    const start = (page - 1) * PAGE_SIZE;
    return items.slice(start, start + PAGE_SIZE);
  }, [gallery.data, page]);

  return (
    <PageShell
      title="Martian Gallery"
      subtitle="Live public gallery of minted Martians rendered directly from their on-chain object ids."
    >
      {gallery.isLoading ? (
        <LoadingGrid count={8} />
      ) : (gallery.data ?? []).length === 0 ? (
        <div className="glass-card p-4 text-sm text-gray-300">No minted Martians found yet.</div>
      ) : (
        <div className="space-y-4">
          <div className="glass-card flex items-center justify-between gap-3 p-4 text-sm text-gray-300">
            <span>Total minted found: <strong>{gallery.data?.length ?? 0}</strong></span>
            <span>Page {page}/{totalPages}</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((monster) => (
              <MartianGifCard key={monster.objectId} monster={monster} showLocation={false} />
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <button className="btn-ghost" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
              Previous
            </button>
            <button
              className="btn-ghost"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </PageShell>
  );
}
