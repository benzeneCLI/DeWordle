import React from "react";

type TileState = "empty" | "correct" | "present" | "absent";

interface GameTileProps {
  letter?: string;
  state?: TileState;
  flipDelayMs?: number;
}

const STATE_CLASSES: Record<TileState, string> = {
  empty: "border-gray-300 bg-white text-gray-900",
  correct: "border-green-600 bg-green-600 text-white",
  present: "border-yellow-500 bg-yellow-500 text-white",
  absent: "border-gray-600 bg-gray-600 text-white",
};

const GameTile: React.FC<GameTileProps> = ({
  letter = "",
  state = "empty",
  flipDelayMs = 0,
}) => {
  const isEvaluated = state !== "empty";

  return (
    <div
      className={`flex h-14 w-14 items-center justify-center border-2 text-2xl font-bold uppercase transition-colors ${STATE_CLASSES[state]} ${isEvaluated ? "tile-flip" : ""}`}
      style={
        isEvaluated
          ? ({ "--flip-delay": `${flipDelayMs}ms` } as React.CSSProperties)
          : undefined
      }
      aria-label={letter ? `Letter ${letter}, ${state}` : "Empty tile"}
    >
      {letter}
    </div>
  );
};

export default GameTile;
