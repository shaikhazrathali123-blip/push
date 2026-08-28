"use client";
import { useEffect, useState } from "react";

export default function FriendsClient() {
  const [friends, setFriends] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [nearby, setNearby] = useState<any[]>([]);
  const [nearbyReason, setNearbyReason] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [sendStatus, setSendStatus] = useState<string | null>(null);

  const loadAll = () => {
    fetch("/api/friends").then((r) => r.json()).then((d) => setFriends(d.friends ?? []));
    fetch("/api/friends/requests").then((r) => r.json()).then((d) => setRequests(d.incoming ?? []));
    fetch("/api/friends/nearby").then((r) => r.json()).then((d) => {
      setNearby(d.nearby ?? []);
      setNearbyReason(d.reason ?? null);
    });
  };

  useEffect(loadAll, []);

  const sendRequest = async () => {
    if (!username.trim()) return;
    setSendStatus("Sending…");
    const res = await fetch("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUsername: username.trim() }),
    });
    setSendStatus(res.ok ? "Request sent" : "Couldn't send — check the username");
    if (res.ok) setUsername("");
    setTimeout(() => setSendStatus(null), 2500);
  };

  const respond = async (friendshipId: string, action: "ACCEPT" | "DECLINE") => {
    await fetch("/api/friends/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ friendshipId, action }),
    });
    loadAll();
  };

  return (
    <div className="px-5 pt-6 pb-4 flex flex-col gap-6">
      <h1 className="font-display text-2xl font-bold">Friends</h1>

      <div className="flex gap-2">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Add by username"
          className="flex-1 bg-base-850 border border-base-700/60 rounded-full px-4 py-2.5 text-sm outline-none focus:border-volt-500"
        />
        <button onClick={sendRequest} className="btn-volt px-5 text-sm font-semibold">Add</button>
      </div>
      {sendStatus && <p className="text-xs text-ink-500 -mt-4">{sendStatus}</p>}

      {requests.length > 0 && (
        <section>
          <h2 className="font-display font-semibold text-sm text-ink-300 mb-3">Requests</h2>
          <div className="flex flex-col gap-2">
            {requests.map((r) => (
              <div key={r.id} className="card p-3.5 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-base-700 overflow-hidden shrink-0">
                  {r.requester.image && <img src={r.requester.image} alt="" className="w-full h-full object-cover" />}
                </div>
                <span className="flex-1 text-sm font-medium truncate">{r.requester.name}</span>
                <button onClick={() => respond(r.id, "ACCEPT")} className="btn-volt px-3 py-1.5 text-xs font-semibold">Accept</button>
                <button onClick={() => respond(r.id, "DECLINE")} className="btn-ghost px-3 py-1.5 text-xs">Decline</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="font-display font-semibold text-sm text-ink-300 mb-3">Your friends ({friends.length})</h2>
        <div className="flex flex-col gap-2">
          {friends.length === 0 && <p className="text-ink-500 text-sm">No friends yet — add someone by username to see their activity here.</p>}
          {friends.map((f) => (
            <div key={f.id} className="card p-3.5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-base-700 overflow-hidden shrink-0">
                {f.image && <img src={f.image} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{f.name}</p>
                <p className="text-xs text-ink-500">
                  {f.lastWorkout ? `${f.lastWorkout.reps} reps · ${new Date(f.lastWorkout.at).toLocaleDateString()}` : "No workouts yet"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-volt-500 font-mono">Lv{f.level}</p>
                <p className="text-[10px] text-ink-500">🔥{f.currentStreak}d</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display font-semibold text-sm text-ink-300 mb-3">Nearby athletes</h2>
        {nearbyReason && <p className="text-ink-500 text-sm">{nearbyReason}</p>}
        <div className="flex flex-col gap-2">
          {nearby.map((n) => (
            <div key={n.id} className="card p-3.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-base-700 overflow-hidden shrink-0">
                {n.image && <img src={n.image} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{n.name}</p>
                <p className="text-xs text-ink-500">{n.city ?? "Nearby"}</p>
              </div>
              <p className="text-xs text-volt-500 font-mono">Lv{n.level}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
