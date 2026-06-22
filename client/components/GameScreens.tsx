// Renders the in-room screens (lobby / round) for whatever phase the room is in.
// Assumes the client is already in a room; returns null otherwise. Shared by the
// home route and the `/<CODE>` join route so both show identical gameplay UI.

import type { GameClient } from "@/lib/useGameClient";
import { Lobby } from "./Lobby";
import { GameRound } from "./GameRound";

export function GameScreens({ game }: { game: GameClient }) {
  const { roomState, playerId } = game;
  if (!roomState) return null;

  const me = roomState.players.find((p) => p.id === playerId) ?? null;
  const isHost = me?.isHost ?? false;

  switch (roomState.phase) {
    // `loading` (fetching the artist's songs) stays in the lobby — only the
    // artist box shows a loading state, so the rest of the page doesn't blank.
    case "loading":
    case "lobby":
      return (
        <Lobby
          state={roomState}
          meId={playerId}
          isHost={isHost}
          onStart={game.startGame}
          onSelectArtist={game.selectArtist}
          onUpdateConfig={game.updateConfig}
        />
      );

    case "countdown":
    case "playing":
    case "reveal":
    case "finished":
      return (
        <GameRound
          state={roomState}
          meId={playerId}
          isHost={isHost}
          clockOffset={game.clockOffset}
          guessFeedback={game.guessFeedback}
          onGuess={game.guess}
          onGiveUp={game.giveUp}
          onNext={game.nextRound}
          onReset={game.resetGame}
        />
      );

    default:
      return null;
  }
}
