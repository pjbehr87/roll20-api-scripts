var GreyhawkInit = GreyhawkInit || (function() {
	'use strict';
	const ScriptName = 'GreyhawkInit';
	const ScriptNameShort = 'GI';
	const Version = '0.1';
	// -------------------------------------------------------
	// - CHAT COMMAND FUNCTIONS                              -
	// -------------------------------------------------------
	const addMonsterAction = function(playerId, dice, actionName) {
			if (!state[ScriptName].CurrentToken) {
				throw 'no current monster selected';
			}
			if (typeof dice === "undefined") {
				throw '"action dice" is undefined';
			}
			if (typeof actionName === "undefined") {
				throw '"action name" is undefined';
			}
			state[ScriptName].Actions[state[ScriptName].CurrentToken] = (state[ScriptName].Actions[state[ScriptName].CurrentToken] || []);
			state[ScriptName].Actions[state[ScriptName].CurrentToken].push({
				name: actionName,
				dice: dice
			});
			getActions(playerId, state[ScriptName].CurrentToken);
		},
		addPlayerAction = function(playerId, dice, actionName) {
			state[ScriptName].Players[playerId] = (state[ScriptName].Players[playerId] || {});
			if (typeof dice === "undefined") {
				throw '"action dice" is undefined';
			}
			if (typeof actionName === "undefined") {
				throw '"action name" is undefined';
			}
			if (typeof state[ScriptName].Players[playerId].characterId === 'undefined') {
				throw 'the GM has not created your character yet';
			}

			let token = getPlayerToken(playerId);
			if (typeof token === 'undefined') {
				throw "There is no token on the player's map that represents the player's character."
			}
			state[ScriptName].Actions[token.id] = (state[ScriptName].Actions[token.id] || []);
			state[ScriptName].Actions[token.id].push({
				name: actionName,
				dice: dice
			});

			getActions(playerId, token.id);
		},
		nextMonster = function() {
			if (state[ScriptName].CurrentToken) {
				getObj('graphic', state[ScriptName].CurrentToken).set('aura2_radius', '');
			}

			if (state[ScriptName].MonsterTokens.length) {
				let monsterTokenId = state[ScriptName].MonsterTokens.pop();
				state[ScriptName].CurrentToken = monsterTokenId;
				getObj('graphic', monsterTokenId).set('aura2_radius', 5).set('aura2_color', '#ff0000');
			}
			else {
				state[ScriptName].CurrentToken = false;
			}
		},
		playerReady = function(playerId) {
			state[ScriptName].Players[playerId] = (state[ScriptName].Players[playerId] || {});
			state[ScriptName].Players[playerId].ready = true;
			chatWhisper(playerId, 'Ready!');
			getPlayersReady(true, false);
		},
		resetMonster = function(playerId) {
			let tokenId = state[ScriptName].CurrentToken;
			if (!tokenId) {
				throw 'no current monster selected';
			}
			state[ScriptName].Actions[tokenId] = [];
			chatWhisper(playerId, 'Actions reset');
		},
		resetPlayer = function(playerId) {
			let token = getPlayerToken(playerId);
			if (typeof token === 'undefined') {
				throw "There is no token on the player's map that represents the player's character.";
			}
			state[ScriptName].Actions[token.id] = [];
			state[ScriptName].Players[playerId].ready = false;
			chatWhisper(playerId, 'Actions reset');
		},
		resetRound = function(playerId) {
			state[ScriptName].Actions = {};
			let startTurnOrder = JSON.parse(Campaign().get('turnorder'));
			let endTurnOrder = [];
			_.each(startTurnOrder, function(turn) {
				turn.pr = 0;
				endTurnOrder.push(turn);
			});
			Campaign().set('turnorder', JSON.stringify(endTurnOrder));
			_.each(state[ScriptName].Players, function (player, id) {
				state[ScriptName].Players[id] = (state[ScriptName].Players[id] || {});
				state[ScriptName].Players[id].ready = false;
			});
			clearCurrentMonster();
			chatInfo('Round Reset! Roll your actions.');
		},
		removePlayer = function (playerName) {
			let player = getPlayerByName(playerName);
			delete state[ScriptName].Players[player.id];
		},
		rollRound = function(playerId) {
			if (!getPlayersReady(false, true, playerId)) {
				return;
			}
			let startTurnOrder = JSON.parse(Campaign().get('turnorder'));
			let endTurnOrder = [];

			function cleanUp(turnOrder, actionsMessages) {
				clearCurrentMonster();
				turnOrder.sort(function(a, b) {
					if (a.pr > b.pr) return 1;
					else if (a.pr < b.pr) return -1;
					else return 0;
				});
				Campaign().set('turnorder', JSON.stringify(turnOrder));
				sendChat(ScriptName, '<br />'+actionsMessages.sort().join(''));
			}
			let _cleanUpDebounce = _.debounce(cleanUp, 1000);
			let actionsMessages = [];

			_.each(state[ScriptName].Actions, function(actions, tokenId) {
				if (actions.length === 0) return true;
				let rollArray = _.map(actions, function(action) {
					return action.dice;
				});

				let token = getObj('graphic', tokenId);
				let rollString = rollArray.join(' + ');
				sendChat(ScriptName, '[[' + rollString + ']]', function(results) {
					let rollTotal = 0,
						turnExists = false,
						rolls = _.map(_.filter(results[0].inlinerolls[0].results.rolls, function(roll) {
								return typeof roll.results !== 'undefined';
							}), function (roll) {
							if (typeof roll.results !== 'undefined') {
								let rollResult = roll.results[0].v;
								rollTotal += rollResult;
								return rollResult;
							}
						}),
						rollNum = 0;
					if (token.get('layer') === 'objects') {
						let tokenName = (token.get('name') === '' ? 'Monster' : token.get('name'));
						actionsMessages.push('<strong>' + tokenName + '</strong> [<strong>' + rollTotal + '</strong>]: <p>' + _.map(actions, function(action) {
							return action.name + ' [' + rolls[rollNum++] + ']';
						}).join('<br />') + '</p>');
					}

					_.each(startTurnOrder, function(turn, index) {
						if (turn.id === tokenId) {
							turn.pr = rollTotal;
							endTurnOrder.push(turn);
							turnExists = true;
							return false;
						}
					})
					if (!turnExists) {
						endTurnOrder.push({
							id: tokenId,
							pr: rollTotal,
							custom: "",
							_pageid: Campaign().get('playerpageid')
						});
					}

					_cleanUpDebounce(endTurnOrder, actionsMessages);
				})
			})
		},
		setPlayerCharacter = function(playerName, characterName) {
			let player = getPlayerByName(playerName);
			let character = getCharacterByName(characterName);

			state[ScriptName].Players[player[0].id] = state[ScriptName].Players[player[0].id] || {};
			state[ScriptName].Players[player[0].id].characterId = character[0].id;
		},
		startMonsters = function () {
			let turnOrder = JSON.parse(Campaign().get('turnorder'));
			let playerCharacterIds = getPlayerCharacterIds();
			state[ScriptName].MonsterTokens = [];
			_.each(turnOrder, function(turn) {
				let represents = getObj('graphic', turn.id).get('represents');
				if (represents === '' || playerCharacterIds.indexOf(represents) === -1) {
					state[ScriptName].MonsterTokens.push(turn.id);
				}
			});
			nextMonster();
		},
		// -------------------------------------------------------
		// - UTILITY FUNCTIONS                                   -
		// -------------------------------------------------------
		chatInfo = function(message) {
			sendChat('', '/desc ' + message, null, {
				noarchive: true
			});
		},
		chatWhisper = function(playerId, message, from) {
			let player = getObj('player', playerId);
			if (typeof from === 'undefined') from = ScriptName;
			if (typeof player === 'undefined') throw 'whisper player undefined';
			sendChat(from, '/w "' + player.get("displayname") + '" ' + message, null, {
				noarchive: true
			});
		},
		clearCurrentMonster = function() {
			if (state[ScriptName].CurrentToken) {
				getObj('graphic', state[ScriptName].CurrentToken).set('aura2_radius', '');
				state[ScriptName].CurrentToken = false;
			}
		},
		getActions = function(playerId, tokenId) {
			state[ScriptName].Actions[tokenId] = (state[ScriptName].Actions[tokenId] || []);
			if (state[ScriptName].Actions[tokenId].length === 0) {
				chatWhisper(playerId, 'No actions');
			}
			else {
				let actionList = _.map(state[ScriptName].Actions[tokenId], function(action) {
					return action.name + ': <strong>' + action.dice + '</strong>';
				})
				chatWhisper(playerId, '<br /><strong>Current Actions:</strong><br />' + actionList.join("<br />"));
			}
		},
		getCharacterByName = function (characterName) {
			let character = findObjs({
				_type: 'character',
				name: characterName
			});
			if (character.length === 0) {
				throw 'There is no character by the name: "' + characterName + '".';
			}
			else if (character.length > 1) {
				throw 'There are too many characters with the name: "' + characterName + '".';
			}
			return character;
		},
		getPlayerByName = function (playerName) {
			let player = findObjs({
				_type: 'player',
				_displayname: playerName
			});
			if (player.length === 0) {
				throw 'There is no player by the name: "' + playerName + '".';
			}
			else if (player.length > 1) {
				throw 'There are too many players with the name: "' + playerName + '".';
			}
			return player;
		},
		getPlayerCharacterIds = function() {
			let playerCharacterIds = [];
			_.each(state[ScriptName].Players, function(player, playerId) {
				playerCharacterIds.push(player.characterId);
			});
			return playerCharacterIds;
		},
		getPlayersReady = function(showReady, showNotReady, playerId) {
			let ready = true,
				notReadyList = [];
			_.each(state[ScriptName].Players, function(player, id) {
				if (typeof player.ready === 'undefined' || !player.ready) {
					ready = false;
					notReadyList.push(getObj('player', id).get('displayname'));
				}
			})
			if (typeof playerId === 'undefined') {
				if (showReady && ready) {
					chatInfo('Everyone is ready!');
				}
				else if (showNotReady && !ready) {
					chatInfo(_.map(notReadyList, function(playerName) {
						return '<strong>' + playerName + '</strong> is not ready.';
					}).join('<br />'));
				}
			}
			else {
				if (showReady && ready) {
					chatWhisper(playerId, 'Everyone is ready!');
				}
				else if (showNotReady && !ready) {
					chatWhisper(playerId, '<br />' + _.map(notReadyList, function(playerName) {
						return '<strong>' + playerName + '</strong> is not ready.';
					}).join('<br />'));
				}
			}
			return ready;
		},
		getPlayerToken = function(playerId) {
			state[ScriptName].Players[playerId].characterId
			state[ScriptName].Players[playerId] = (state[ScriptName].Players[playerId] || {});
			let token = findObjs({
				_type: 'graphic',
				_pageid: Campaign().get('playerpageid'),
				represents: state[ScriptName].Players[playerId].characterId
			});
			return token[0];
		},
		getPlayerTokenIds = function() {
			let playerTokenIds = [];
			_.each(state[ScriptName].Players, function(player) {
				let character = getObj('character', player.characterId);
				character.get('defaulttoken', function(data) {
					data = JSON.parse(data);
					let token = findObjs({
						_type: 'graphic',
						_pageid: data.page_id,
						imgsrc: data.imgsrc
					});
					playerTokenIds.push(token[0].id);
				});
			});
			return playerTokenIds;
		},
		getVars = function(varString) {
			let finalVars = [];
			let match;
			while (varString !== '') {
				match = varString.match(/(?:^"([^"]*)"|^([^ ]*))/g);
				varString = varString.replace(match[0], '').substring(1);
				match = match[0].replace(/"/g, '');
				finalVars.push(match);
			}
			return finalVars;
		},
		handleChatMessage = function(msg) {
			if (msg.content.substring(0, 3).toLowerCase() === '!' + ScriptNameShort.toLowerCase()) {
				let varString = msg.content.substring(4);
				let command = varString.match(/^([^ ]*)/)[1];
				varString = varString.substring(command.length + 1);
				try {
					let vars = getVars(varString);
					switch (command.toLowerCase()) {
						case 'addaction':
							// MessagePlayerId
							// Dice
							// ActionName
							addPlayerAction(msg.playerid, vars[0], vars[1]);
							break;
						case 'addmonsteraction':
							// MessagePlayerId
							// Dice
							// ActionName
							addMonsterAction(msg.playerid, vars[0], vars[1]);
							break;
						case 'getactions':
							// MessagePlayerId
							// TokenId
							let token = getPlayerToken(playerId);
							if (typeof token === 'undefined') {
								throw "There is no token on the player's map that represents the player's character.";
							}
							getActions(msg.playerid, token.id);
							break;
						case 'getmonsteractions':
							// MessagePlayerId
							// TokenId
							if (!state[ScriptName].CurrentToken) {
								throw 'No Current Monster is selected.';
							}
							getActions(msg.playerid, state[ScriptName].CurrentToken);
							break;
						case 'getplayersready':
							// ShowReady
							// ShowNotReady
							// MessagePlayerId
							getPlayersReady(true, true, msg.playerid);
							break;
						case 'nextmonster':
							nextMonster();
							break;
						case 'ready':
							// MessagePlayerId
							playerReady(msg.playerid);
							break;
						case 'resetround':
							// MessagePlayerId
							resetRound(msg.playerid);
							break;
						case 'removeplayer':
							removePlayer(vars[0]);
							break;
						case 'reset':
							// MessagePlayerId
							resetPlayer(msg.playerid);
							break;
						case 'resetmonster':
							// MessagePlayerId
							resetMonster(msg.playerid);
							break;
						case 'rollround':
							// MessagePlayerId
							rollRound(msg.playerid);
							break;
						case 'setplayercharacter':
							// PlayerName
							// CharacterName
							setPlayerCharacter(vars[0], vars[1]);
							break;
						case 'startmonsters':
							startMonsters();
							break;
						case 'debug':
							debug(msg.playerid);
							break;
						case 'debugclear':
							debugClear();
							break;
						case 'debugset':
							debugSet(vars[0]);
							break;
						default:
							chatWhisper(msg.playerid, 'Command "' + command + '" not found.');
							break;
					}
				}
				catch (err) {
					chatWhisper(msg.playerid, '"' + command + '": ' + err, 'ERROR');
				}
			}
			return
		},
		// -------------------------------------------------------
		// - META FUNCTIONS                                     -
		// -------------------------------------------------------
		registerEventHandlers = function() {
			on('chat:message', handleChatMessage);
		},
		initState = function() {
			state[ScriptName] = (state[ScriptName] || {})
			// Object of Graphic ID keys with array of actions
			state[ScriptName].Actions = (state[ScriptName].Actions || {});
			// Object of Player ID keys with Character ID
			state[ScriptName].Players = (state[ScriptName].Players || {});
			// Array of Monster Graphic IDs
			state[ScriptName].MonsterTokens = (state[ScriptName].MonsterTokens || []);
			state[ScriptName].Version = Version;
		},
		// -------------------------------------------------------
		// - DEBUG FUNCTIONS                                     -
		// -------------------------------------------------------
		debug = function(playerId) {
			debugChat(playerId, state[ScriptName]);
		},
		debugChat = function(playerId, message) {
			message = JSON.stringify(message, null, ' ').split('\n').join('<br />');
			chatWhisper(playerId, '<br />' + message);
		},
		debugClear = function() {
			state[ScriptName].Actions = {};
			state[ScriptName].Players = {};
			state[ScriptName].MonsterTokens = [];
			state[ScriptName].CurrentToken = false;
		};

	return {
		InitState: initState,
		RegisterEventHandlers: registerEventHandlers
	};
}());

on('ready', function() {
	'use strict';

	GreyhawkInit.InitState();
	GreyhawkInit.RegisterEventHandlers();
});