import {defs, tiny} from './examples/common.js';

const {
    Vector, Vector3, vec, vec3, vec4, color, hex_color, Shader, Matrix, Mat4, Light, Shape, Material, Scene,
} = tiny;

export class frisbee_flicker extends Scene {
    constructor() {
        // constructor(): Scenes begin by populating initial values like the Shapes and Materials they'll need.
        super();

        // At the beginning of our program, load one of each of these shape definitions onto the GPU.
        this.shapes = {
            cylinder: new defs.Capped_Cylinder(4, 12, [[0, 2], [0, 1]]),
        };

        // *** Materials
        this.materials = {
            test: new Material(new defs.Phong_Shader(),
                {ambient: .4, diffusivity: .6, color: hex_color("#ffffff")}),
        }

        this.initial_camera_location = Mat4.look_at(vec3(0, 10, 20), vec3(0, 0, 0), vec3(0, 1, 0));
        this.angle_left = false
        this.angle_right = false
        this.frisbee_angle = 0
    }

    make_control_panel() {
        this.key_triggered_button("View solar system", ["Control", "0"], () => this.attached = () => null);
        this.new_line();
        this.key_triggered_button("Angle Left", ["c"], () => this.angle_left = true);
        this.key_triggered_button("Angle Right", ["b"], () => this.angle_right = true);
    }

    // Attach HTML mouse events to the drawing canvas.
    add_mouse_controls(canvas) {
        this.mouse = {x: 0, y: 0, event: null};
        canvas.addEventListener('mousemove', function () {
            var x, y;
            this.mouse.x = x;
            this.mouse.y = y;
          }, false);
    }

    display(context, program_state) {
        // display():  Called once per frame of animation.
        // Setup -- This part sets up the scene's overall camera matrix, projection matrix, and lights:
        if (!context.scratchpad.controls) {
            this.children.push(context.scratchpad.controls = new defs.Movement_Controls());
            // Define the global camera and projection matrices, which are stored in program_state.
            console.log(this.initial_camera_location)
            program_state.set_camera(this.initial_camera_location);
        }

        program_state.projection_transform = Mat4.perspective(
            Math.PI / 4, context.width / context.height, .1, 1000);

        this.add_mouse_controls(context.canvas);

        const t = program_state.animation_time / 1000, dt = program_state.animation_delta_time / 1000;
        const yellow = hex_color("#fac91a");
        let model_transform = Mat4.identity();

        const light_position = vec4(0, 0, 0, 1);
        // The parameters of the Light are: position, color, size
        program_state.lights = [new Light(light_position, yellow, 1000)];

        let frisbee_transform = model_transform.times(Mat4.scale(3,3,1/2))
        console.log(this.frisbee_angle)

        // INITIAL
        let x = 0;
        let y = 4;
        let z = 10;
        let ball_transform = Mat4.translation(x, y, z);

        if(this.angle_left){
            this.frisbee_angle -= 1
            this.angle_left = false
        }
        if(this.angle_right){
            this.frisbee_angle += 1
            this.angle_right = false
        }

        frisbee_transform = frisbee_transform.times(Mat4.rotation(this.frisbee_angle,1,1,1));

        if (this.mouse.released) 
        {
            console.log("mouse released")
            let mouse_x = this.mouse.x;
            let mouse_y = this.mouse.y;
            dx = mouse_x;
            dy = Math.sin(this.frisbee_angle) * mouse_y;
            dz = mouse_y;
            this.t_released = 3;
            let k = 10; 
            this.gravity = 5;

            // Calculate the ball's new position
            ball_x = x + k*dx*this.t_released;
            ball_y = y + k*dy*this.t_released - 1/2*gravity*this.t_released*this.t_released;
            ball_z = z + k*dz*this.t_released;
            ball_transform = ball_transform.times(Mat4.translation(ball_x, ball_y , ball_z))

        }

        ball_transform = ball_transform.times(frisbee_transform);
        this.shapes.cylinder.draw(context, program_state, ball_transform, this.materials.test.override({color: yellow, ambient:1}));
        
    }
}