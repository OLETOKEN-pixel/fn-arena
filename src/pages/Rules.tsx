import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Gamepad2, FileText, Shield } from 'lucide-react';

export default function Rules() {
  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto py-6 lg:py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent/30 to-accent/10 flex items-center justify-center border border-accent/20">
              <Gamepad2 className="w-6 h-6 text-accent" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Match Rules</h1>
              <p className="text-sm text-muted-foreground">How To Play on OleBoy Token</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/terms">
                <FileText className="w-4 h-4 mr-1" />
                Terms
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/privacy">
                <Shield className="w-4 h-4 mr-1" />
                Privacy
              </Link>
            </Button>
          </div>
        </div>

        {/* Content Card */}
        <Card className="p-6 lg:p-8">
          <div className="prose prose-invert max-w-none prose-headings:text-amber-400 prose-headings:font-bold prose-h2:text-2xl prose-h2:lg:text-3xl prose-h2:mt-12 prose-h2:mb-6 prose-h2:pb-3 prose-h2:border-b prose-h2:border-amber-400/30 prose-h3:text-xl prose-h3:font-semibold prose-h3:mt-8 prose-h3:mb-4 prose-li:text-muted-foreground prose-p:text-muted-foreground">
            
            <h2>1. Punctuality, AFK & Match Start</h2>
            <ul className="space-y-2">
              <li>From the moment the match is marked as started, each player/team has up to 5 minutes to enter the lobby and be ready to play.</li>
              <li>If you are not present and ready within the 5-minute window, you may be given a forfeit loss.</li>
              <li>If your opponent does not show up within 5 minutes, you must provide clear photo evidence to support an AFK/no-show claim.</li>
              <li>In team matches, if one or more teammates don't arrive on time, the match may still continue with the players who are present.</li>
              <li>If an opponent is repeatedly AFK during the match, you may eliminate them a maximum of one time per AFK incident.</li>
              <li>A match can only be cancelled if both sides agree to cancel.</li>
            </ul>

            <h2>2. Disconnects & Pauses</h2>
            <ul className="space-y-2">
              <li>If a player disconnects or goes AFK during the match, the game may be paused for up to 6 minutes to allow them to return.</li>
              <li>The 6-minute allowance is cumulative per team (it can be split across multiple disconnects, but the total cannot exceed 6 minutes).</li>
              <li>Once the total pause time is used, the match must continue or the missing player/team may be forfeited.</li>
              <li>To avoid unfair advantages, you must not respawn during a round in a way that could impact siphon or similar mechanics.</li>
              <li>If a teammate disconnects mid-round, the round must be played out and will still count.</li>
              <li>If a teammate disconnects before a round begins, the match may be paused within the 6-minute allowance.</li>
            </ul>

            <h2>3. Linked Account Accuracy (Epic / Platform)</h2>
            <ul className="space-y-2">
              <li>If a player has linked the wrong Epic account, platform, or username, they have 5 minutes to correct it once a staff member is present.</li>
              <li>After the account details are corrected, the match may be restarted using the correct account, but the score must remain the same as before the restart.</li>
            </ul>

            <h2>4. Bugs, Glitches & Exploits</h2>
            <ul className="space-y-2">
              <li>If a bug/glitch occurs during a round and negatively impacts either side, that specific round may be voided and not counted.</li>
              <li>If needed, the lobby/game may be reset to remove the issue, but the match must continue from the current scoreline.</li>
              <li>Any player intentionally abusing bugs/glitches for advantage may be penalized.</li>
              <li>Game crashes and platform/system errors are treated as disconnect/AFK situations (see section 2), not as "bugs."</li>
            </ul>

            <h2>5. Lobby, Map & Hosting Requirements</h2>
            <ul className="space-y-2">
              <li>Matches must be played on the correct region and the agreed map code/settings.</li>
              <li>The host should load in as Team 1, and the opponent(s) as Team 2. If rounds are accidentally awarded to the "wrong" team, they may still count.</li>
              <li>If the wrong map/code is used, you must switch to the correct one and continue from the existing scoreline.</li>
              <li>Kicking/removing opponents from the party during the match may result in a round loss.</li>
              <li>If incorrect settings were used but rounds were already played, those rounds/matches may still be considered valid at staff discretion.</li>
            </ul>

            <h2>6. Other Rules & Staff Decisions</h2>
            <ul className="space-y-2">
              <li>Spectators are not allowed. If a spectator is present during a round, they must be removed; the team that did not invite the spectator may be awarded a round.</li>
              <li>General trash talk/toxicity may happen, but racism, homophobia, or hate speech is strictly prohibited and can result in a platform mute and disciplinary action.</li>
              <li>Do not attempt to mislead your opponent about the rules to gain an advantage.</li>
              <li>Staff may consider the full context (time-wasting, repeated disconnects, unsportsmanlike behavior, etc.) and may award rounds or decide an overall winner accordingly.</li>
              <li>Staff decisions are final and must be respected.</li>
            </ul>

            <h2>7. Reporting Players</h2>
            <ul className="space-y-2">
              <li>If you are confident your opponent is breaking rules, stop playing and report immediately.</li>
              <li>If you are not 100% sure, you may continue the match and submit a report after the match ends.</li>
            </ul>

          </div>
        </Card>
      </div>
    </MainLayout>
  );
}
