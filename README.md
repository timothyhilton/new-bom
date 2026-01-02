This is a real-time quiz application project that I made to replace slideshows and manual tallying for a school event named "BOM" (battle of minds).

During the event there is 1 computer on the "presenter" page, 4 "player" computers for each of the 4 teams on stage & a computer on the "controller" screen + any of the computers running the node server

### Features
- Live leaderboard with auto-updating team scores.
- Multiple pages for different roles: player, controller, presenter 
- Manual score intervention
- Many edge cases accounted for like duplicate answers and supports answer locking
- Persistent state, teams can reconnect if disconnected
- Clean project layout, questions & saved answers json file

### Tech stack
I tried to keep this one very simple, it uses plain static html, css, js for the pages, with socket.io for communication and node for the server

[Watch it in action here!!](./readme/video.MP4)

