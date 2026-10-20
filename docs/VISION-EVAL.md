# Can Claude check a breadboard build from a photo?

The eval is in `scripts/vision-eval/`. It covers 5 reference builds, 29 injected faults plus 5 correct builds, 2 image styles (clean top-down, and a tilted, blurred JPEG "phone photo"), and 2 prompt conditions:
- **A:** circuit description only;
- **B:** hole-by-hole build plan.

That makes 136 calls to `claude-opus-5-5` (medium effort), one sample each.

- **Detected:** the model said the build is not correct.
- **Localised:** an issue names the culprit part or hole.
- **False alarm:** the model reported a problem on a correct build.

## Final run (2026-10-20)

| slice | faults | detected | localised | correct builds | false alarms |
|---|---|---|---|---|---|
| all | 116 | 85% | 78% | 20 | 10% |
| photo, circuit description only (A) | 29 | 76% | 52% | 5 | 0% |
| photo, hole-by-hole plan (B) | 29 | 86% | 86% | 5 | 0% |
| clean, hole-by-hole plan (B) | 29 | 93% | 93% | 5 | 20% |

By fault:

| fault | detected | localised |
|---|---|---|
| shorted resistor | 100% | 100% |
| wrong Pico pin | 100% | 81% |
| missing ground wire | 95% | 70% |
| leg one hole off | 90% | 85% |
| reversed LED | 65% | 65% |
| wire on wrong rail | 65% | 65% |

## What we learned

1. **Telling it the intended hole positions matters most.** On photos, localisation goes from 52% with the circuit description to 86% with the hole-by-hole plan. That argues for Sparkbench producing a hole-accurate breadboard layout for each project, not only a schematic.
2. **Polarity is the hard part.** Reversed LEDs were caught 65% of the time. From above, an LED's long leg is invisible and the flat edge is subtle. The app asks for a close-up and lists polarity under "check these yourself" rather than claiming it's fine.
3. **Neighbouring holes are the main source of false alarms.** The two remaining false alarms both misread two jumper ends in adjacent holes (a30/a31) as one hole off.
4. **The eval itself needed three fixes before the numbers meant anything:**
   - **File names leaked the answer.** In the first run, files like `blink__reversed-led__clean.png` gave the answer away and scores were near perfect. Images are now copied to a neutral `board.png`.
   - **Part bodies hid the legs.** LED, LDR and capacitor bodies hid their own legs. That made correct builds look wrong (45% false alarms in the second run).
   - **Leaning parts covered other legs.** Parts drawn leaning back sometimes covered a neighbour's misplaced leg, hiding the fault ("leg one hole off" fell to 25%). Each part now leans whichever way hides the fewest other holes.

## Caveat

These are synthetic renders: clean colours, no glare on metal, no cable clutter and one standard breadboard. Real photos will score lower. The next step is a set of real photos of known-good and known-bad builds, labelled with the same fault types.
