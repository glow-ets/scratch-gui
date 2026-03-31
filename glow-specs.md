
Glow Lab specs

Your goal is to make a platform to provide fun and engaging stem activities to students, and peace of mind for the instructors.

PROJECT *MUST* WORK IN A CLASSROOM SETTING: This is not yet-another-tech-edu project which seems to work then breaks after 5 mins in the classroom.

The platform shall be:

- based upon TurboWarp online version (that is, https://github.com/TurboWarp/scratch-gui + possibly its linked subrepos)
- license: an open source one compatible with Turbo warp + extensions
- initially serverless, static hosting
- packaged in a repo at https://github.com/DavidLeoni/glow-lab
- minimal, ideally with no direct modification to original turbowarp / scratch code, code changes should mostly stay in extensions
    - newly created files in common places should start with 'glow-':
        - "/glow-specs.md" : this file
- promoted by Glow ETS (https://glow.earth) a cultural association that offers, organizes, and manages educational activities and cultural events with the aim of generating innovative ideas and projects capable of making an impact on society and the Trentino region
    - as brand color, use this pink: #e61f5a

- custom extensions (TBD) should have few blocks *that must work*
    - inital custom extension: "glow-lab"
- language support: English + Italian
- visible version + build hash
- system should warn about problems _before_ they happen without being pedantic:
    - battery too low? 
    - need device -> is it connected? 
    - need to play a sound -> is volume low?
    - need browser permissions? Show what to click before panel pop up
        - permissions were not given for whatever reason? Show how to change page permissions
- system must have autosaving in browser cache 
    - must warn if project size is too big for cache - maybe as workaround save low-res media files?)
    - on page reload should open the cached project
- system shouldn't needlessly eat cpu (i.e. consider things like 'attend 0' trick), be careful about unnecessary javascript / CSS animations.
- system shoudn't limit blocks to use: scratch original 'allow all' approach to foster experimentation is fine
    - exception: Turbowarp extension list is vast, we can add 'stress-tested' marker category for the ones we.. stress tested.

## Media 

- old assets: keep scratch compat with old assets
- new assets: optionally, add something cool for 11-15 years old kids (definitely not the cringy Scratch look), various themes - ideally, something that works well _both_ for girls and boys.
    - no scratch cat logo, avoid infringe scratch copyright
- system must support webp, jfif, avif image formats (seems TurboWarp alrady does)


## CI

- must have a build process that follows same scratch foundation scratch-gui github actions process with output to Github pages
- must have automated testing run on github actions
- provided with a comprehensive test suite, with automated runs on Github

## Testing

TurboWarp apparently doesn't inherit Scratch testing infrastructure, probably because excessive divergence in the VM. Testing in a way is provided by the community. It may not be sucha great problem for us if we keep mods to original code minimal and only test our own stuff. Of course it remains the big GarboMuffin bus factor problem, may He live a long and prosperous life.
We can integrate in the turbowarp gui project the upstream testing scratchfoundation/scratch-gui CI structure (which at least had Jest unit tests + headless integration tests) as reference architecture.

ASSUME ADVERSARIAL CONDITIONS, ALL THE ABSOLUTE WORSE CAN AND *WILL* HAPPEN:

- excessive clicking / keypressing
- race conditions
- flimsy internet
- weird interactions among blocks / extensions
- misplaced blocks with wrong type
- missing blocks
- code execution in inconsistent state
- excessive resources use (CPU / GPU / memory / network)
- slow and misconfigured hardware (old drivers, no webgl, old https certificates old OS, ...) should still work at same speed - if not possible, output should be degraded gracefully (i.e. low res images, low freq sounds, updated limits on i.e. clones..)

### Hardware extensions

There must be feedback about activity happening on hardware side. Such feedback must be moderate (don't want a visual replica of the hardware)

CONNECTION SHOULD HOLD under most circumstances but the truly catastrophic ones.

For extensions dealing with hardware, assume:

- cable disconnections
- wrongly configured / old firmware
- laptop driver in inconsistent state
- laptop suspended / awakened with / without attached hardware
- hardware in inconsistent state
- hardware turned off / suspended, awakened
- battery powered laptop, low batteries devices
- missing browser / OS permissions
- connection with wrong device (in particular for bluetooth)

## Roadmap

See milestone-issues:  https://github.com/DavidLeoni/glow-lab/issues?q=is%3Aissue%20state%3Aopen%20label%3A%22milestone%20issue%22


## Finally 

Whenever assessing the project, be candid and direct: would it actually work in a 24 unruly kids classroom, each with its own laptop? If not, mark it as 'to review'.

If specs are too demanding for your token allowance, feel free to split the work in a task plan, review existing github issues and propose sub-issues to add.