import test from 'node:test';
import assert from 'node:assert/strict';
import {controllerBindings as b,controllerSettings} from '../desktop/equestria/controller.mjs';
test('DualSense controls retain mouse/keyboard and have no conflicting buttons',()=>{
 const expected={0:'jump',1:'place',2:'dig',3:'zoom',6:'pause',9:'hotbar_previous',10:'hotbar_next',11:'zoom',12:'aux1',13:'sneak',14:'minimap'};
 for(const [button,action]of Object.entries(expected))assert.deepEqual(Object.entries(b).filter(([,keys])=>keys.split('|').includes('GAMEPAD_BUTTON_'+button)).map(([key])=>key),[action]);
 assert.ok(b.forward.includes('SYSTEM_SCANCODE_26')&&b.forward.includes('GAMEPAD_AXIS_MINUS_1'));assert.ok(b.dig.includes('MOUSE_BUTTON_1'));assert.ok(b.place.includes('MOUSE_BUTTON_3'));
 assert.ok(b.camera_pitch_up.includes('GAMEPAD_AXIS_MINUS_3'));assert.ok(b.camera_yaw_right.includes('GAMEPAD_AXIS_PLUS_2'));
 assert.match(controllerSettings(),/keymap_slot1 = \n/,'Number keys must not also move the hidden book wheel');
});
