# jsMixer #

**jsMixer** is a Javascript module for working with the [Mixer API](https://dev.mixer.com/rest/index.html).

## Requirements
* Tested against Mixer API v1.0
* For Node.js you will need the [xmlhttprequest](https://www.npmjs.com/package/xmlhttprequest) library.

## Documentation ##
### Getting Started

If you are using Node.js, install jsMixer using npm:

```bash
$ npm install jsmixer
```

You can now require and use jsmixer like so:

```js
let MixerAPI = require('jsmixer')

const MIXER_TOKEN = process.env.MIXER_TOKEN

let mapi = new MixerAPI(MIXER_TOKEN, ['user:act_as'])

mapi.auth().then(r => console.log(r)).catch(e => console.log(e))
```

Refer to the [Mixer API Documentation](https://dev.mixer.com/rest/index.html) and the [jsMixer Example](https://github.com/Sighmir/jsMixer/tree/master/example) for more information.  

### Browser

You can also load this script on your browser like so:

```html
<script src='https://cdn.jsdelivr.net/npm/jsmixer/jsMixer.js'></script>
```

You can now use the class MixerAPI normally on the page, like you would on Node.js.

## License ##
```
jsMixer - Mixer API Javascript Library.
Copyright (C) 2019  Guilherme Caulada (Sighmir)

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
```
