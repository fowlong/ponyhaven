// Luanti 5.17 uses SDL's standard gamepad layout (DualSense USB/Bluetooth).
// Keep keyboard/mouse bindings alongside the controller in the same keymap.
export const controllerBindings={
 forward:'SYSTEM_SCANCODE_26|GAMEPAD_AXIS_MINUS_1',backward:'SYSTEM_SCANCODE_22|GAMEPAD_AXIS_PLUS_1',
 left:'SYSTEM_SCANCODE_4|GAMEPAD_AXIS_MINUS_0',right:'SYSTEM_SCANCODE_7|GAMEPAD_AXIS_PLUS_0',
 camera_yaw_left:'GAMEPAD_AXIS_MINUS_2',camera_yaw_right:'GAMEPAD_AXIS_PLUS_2',
 camera_pitch_up:'GAMEPAD_AXIS_MINUS_3',camera_pitch_down:'GAMEPAD_AXIS_PLUS_3',
 jump:'SYSTEM_SCANCODE_44|GAMEPAD_BUTTON_0',dig:'MOUSE_BUTTON_1|GAMEPAD_BUTTON_2',place:'MOUSE_BUTTON_3|GAMEPAD_BUTTON_1',
 zoom:'SYSTEM_SCANCODE_8|GAMEPAD_BUTTON_3|GAMEPAD_BUTTON_11',
 sneak:'SYSTEM_SCANCODE_12|GAMEPAD_BUTTON_13',minimap:'SYSTEM_SCANCODE_25|GAMEPAD_BUTTON_14',
 hotbar_previous:'GAMEPAD_BUTTON_9',hotbar_next:'GAMEPAD_BUTTON_10',pause:'GAMEPAD_BUTTON_6',
 aux1:'SYSTEM_SCANCODE_27|GAMEPAD_BUTTON_12',inventory:'SYSTEM_SCANCODE_43',drop:''
};
export function controllerSettings(){
 const bindings={...controllerBindings};for(let i=1;i<=8;i++)bindings['slot'+i]='';
 return Object.entries(bindings).map(([action,keys])=>`keymap_${action} = ${keys}\n`).join('')+'joystick_inner_deadzone = 0.15\njoystick_frustum_sensitivity = 150\n';
}
