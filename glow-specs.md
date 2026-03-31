
Your goal is to make a platform to provide fun and engaging stem activities to students, and peace of mind for the instructors.

PROJECT *MUST* WORK IN A CLASSROOM SETTING. 

This is not yet-another-tech-edu project which seems to work then breaks after 5 mins in the classroom.


The platform shall be:

- based upon TurboWarp online version (that is, https://github.com/TurboWarp/scratch-gui + possibly its linked subrepos)
- license: an open source one compatible with Turbo warp + extensions
- initially serverless, static hosting
- packaged in a repo at https://github.com/DavidLeoni/glow-lab
- minimal, ideally with no direct modification to original turbowarp / scratch code, code changes should mostly stay in extensions
- custom extensions (TBD) should have few blocks *that must work*


- language support: English + Italian
- visible version + build hash
- system should warn about problems _before_ they happen without being pedantic
    - battery too low? 
    - need device -> is it connected? 
    - need to play a sound -> is volume low?
    - need browser permissions? Show what to click before panel pop up
        - permissions were not given for whatever reason? Show how to change page permissions
- system must have autosaving in browser cache 
    - must warn if project size is too big for cache - maybe as workaround save low-res media files?)
    - on page reload should open the cached project
- system shouldn't needlessly eat cpu (i.e. consider things like 'attend 0' trick)

## Media 

- easy rebranding: one shop stop for changing logos 
- assets: something cool for 11-15 years old kids (definitely not the cringy Scratch look) - for visual style, get ideas from https://glow.earth website.
- support webp, jfif, avif image formats (seems TurboWarp alrady does)

## CI

- must have a build process that outputs in a 'demo' folder
- must have automated testing run on github actions
- provided with a comprehensive test suite, with automated runs on Github

## Testing

ALL THE ABSOLUTE WORSE CAN AND *WILL* HAPPEN. ASSUME ADVERSARIAL CONDITIONS:

- excessive clicking / keypressing
- race conditions
- flimsy internet
- weird interactions among blocks / extensions
- misplaced blocks with wrong type
- missing blocks
- code execution in inconsistent state
- excessive resources use (CPU / GPU / memory / network)
- slow and misconfigured hardware (old drivers, no webgl, old https certificates old OS, ...) should still work at same speed - if not possible, output should be degraded gracefully (i.e. low res images, low freq sounds, updated limits on i.e. clones..)

TurboWarp apparently doesn't inherit Scratch testing infrastructure, probably because excessive divergence in the VM. Testing in a way is provided by the community. 
It may not be sucha great problem for us if we keep mods to original code minimal and only test our own stuff.
Of course it remains the big GarboMuffin bus factor problem, may He live a long and prosperous life.

For testing, we can integrate in the turbowarp gui project the upstream scratchfoundation/scratch-gui CI structure (which at least had Jest unit tests + headless integration tests) as reference architecture.

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

If specs are too demanding for your token allowance, feel free to split the work in a task plan.
