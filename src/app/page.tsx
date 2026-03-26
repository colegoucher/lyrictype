import TypingTest from "@/components/TypingTest";

const AT_THE_DOOR = `[Verse 1]
I can't escape it
I'm never gonna make it out of this in time
I guess that's just fine
I'm not there quite yet
My thoughts, such a mess
Like a little boy
What you runnin' for?

[Pre-Chorus]
Run at the door
Anyone home?
Have I lost it all?

[Chorus]
Struck me like a chord
I'm an ugly boy
Holdin' out the night
Lonely after light
You begged me not to go
Sinkin' like a stone
Use me like an oar
And get yourself to shore

[Verse 2]
A bang at the door
Anyone home?
That's just what they do
Right in front of you
Like a cannonball
Slammin' through your wall
In their face, I saw
What they're fightin' for

[Pre-Chorus]
I can't escape it
I'm never gonna make it 'til the end, I guess

[Chorus]
Struck me like a chord
I'm an ugly boy
Holdin' out the night
Lonely after light
Bangin' on the door
I don't wanna know
Sinkin' like a stone
So use me like an oar

[Bridge]
Hard to fight what I can't see
Not tryna build no dynasty
I can't see beyond this wall
But we lost this game
So many times before

[Outro]
Lying on the cold floor
I'll be waiting, yeah
I'll be waiting from the other side
Waiting for the tide to rise
Lying on the cold floor
I'll be waiting, yeah
I'll be waiting from the other side
Waiting for the tide to rise`;

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 py-16 gap-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">LyricType</h1>
        <p className="text-sm text-zinc-500 mt-1">Type the lyrics. Feel the music.</p>
      </div>
      <TypingTest
        lyrics={AT_THE_DOOR}
        songTitle="At the Door"
        artist="The Strokes"
      />
    </main>
  );
}
