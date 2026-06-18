export const BRING_ME_TO_LIFE = `How can you see into my eyes
Like open doors
Leading you down into my core
Where I've become so numb
Without a soul
My spirit's sleeping somewhere cold
Until you find it there and lead it back home
Wake me up
Wake me up inside
I can't wake up
Wake me up inside
Save me
Call my name and save me from the dark
Wake me up
Bid my blood to run
I can't wake up
Before I come undone
Save me
Save me from the nothing I've become
Now that I know what I'm without
You can't just leave me
Breathe into me and make me real
Bring me to life
Wake me up
Wake me up inside
I can't wake up
Wake me up inside
Save me
Call my name and save me from the dark
Wake me up
Bid my blood to run
I can't wake up
Before I come undone
Save me
Save me from the nothing I've become
Bring me to life
I've been living a lie
There's nothing inside
Bring me to life
Frozen inside without your touch
Without your love darling
Only you are the life among the dead
All this time I can't believe I couldn't see
Kept in the dark but you were there in front of me
I've been sleeping a thousand years it seems
Got to open my eyes to everything
Without a thought without a voice without a soul
Don't let me die here
There must be something more
Bring me to life
Wake me up
Wake me up inside
I can't wake up
Wake me up inside
Save me
Call my name and save me from the dark
Wake me up
Bid my blood to run
I can't wake up
Before I come undone
Save me
Save me from the nothing I've become
Bring me to life
I've been living a lie
There's nothing inside
Bring me to life`;

export type GuessStep = {
  player: "Alex" | "Jordan" | "Sam";
  word: string;
  pauseMs: number;
  note?: string;
};

/** Timed guesses with 10s cooldown rotation across three players. */
export const BRING_ME_TO_LIFE_GUESSES: GuessStep[] = [
  { player: "Alex", word: "numb", pauseMs: 1500 },
  { player: "Jordan", word: "soul", pauseMs: 1200 },
  { player: "Sam", word: "moon", pauseMs: 1000, note: "wrong guess" },
  { player: "Sam", word: "sleeping", pauseMs: 800 },
  { player: "Jordan", word: "cold", pauseMs: 8500 },
  { player: "Alex", word: "home", pauseMs: 9000 },
  { player: "Sam", word: "undone", pauseMs: 11000 },
  { player: "Jordan", word: "nothing", pauseMs: 1000 },
  { player: "Alex", word: "become", pauseMs: 11000 },
  { player: "Jordan", word: "frozen", pauseMs: 1000 },
  { player: "Sam", word: "darling", pauseMs: 11000 },
  { player: "Alex", word: "thousand", pauseMs: 11000 },
  { player: "Jordan", word: "everything", pauseMs: 1000 },
  { player: "Sam", word: "die", pauseMs: 11000 },
  { player: "Jordan", word: "something", pauseMs: 1000 },
];
