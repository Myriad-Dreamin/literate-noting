import { createContext, useContext, type ReactNode } from "react";
import type { AppSettings, PianoToneId } from "../shared/types";

export type PianoToneOption = {
  id: PianoToneId;
  label: string;
  program: number;
};

export const pianoToneOptions: PianoToneOption[] = [
  {
    id: "acoustic_grand_piano",
    label: "原声大钢琴",
    program: 0
  },
  {
    id: "bright_acoustic_piano",
    label: "明亮原声钢琴",
    program: 1
  },
  {
    id: "electric_grand_piano",
    label: "电声大钢琴",
    program: 2
  },
  {
    id: "honkytonk_piano",
    label: "酒吧钢琴",
    program: 3
  },
  {
    id: "electric_piano_1",
    label: "电钢琴 I",
    program: 4
  },
  {
    id: "electric_piano_2",
    label: "电钢琴 II",
    program: 5
  },
  {
    id: "harpsichord",
    label: "羽管键琴",
    program: 6
  },
  {
    id: "clavinet",
    label: "古钢琴",
    program: 7
  }
];

export const defaultPianoToneOption: PianoToneOption = {
  id: "acoustic_grand_piano",
  label: "原声大钢琴",
  program: 0
};

export const defaultAppSettings: AppSettings = {
  pianoTone: defaultPianoToneOption.id,
  pianoProgram: defaultPianoToneOption.program,
  soundFontUrl: "https://paulrosen.github.io/midi-js-soundfonts/FluidR3_GM/",
  soundFontVolumeMultiplier: 3
};

const SettingsContext = createContext<AppSettings>(defaultAppSettings);

export function SettingsProvider({
  children,
  settings
}: {
  children: ReactNode;
  settings: AppSettings;
}) {
  return (
    <SettingsContext.Provider value={settings}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useAppSettings(): AppSettings {
  return useContext(SettingsContext);
}

export function settingsForTone(pianoTone: PianoToneId): AppSettings {
  const option =
    pianoToneOptions.find((toneOption) => toneOption.id === pianoTone) ??
    defaultPianoToneOption;

  return {
    ...defaultAppSettings,
    pianoTone: option.id,
    pianoProgram: option.program
  };
}
