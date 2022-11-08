import { defs, tiny } from './examples/common.js';
import { Body } from './collision.js';

const {
    Vector, Vector3, vec, vec3, vec4, color, hex_color, Shader, Matrix, Mat4, Light, Shape, Material, Scene,
} = tiny;

//colors
var yellow = hex_color("#fac91a");
var red = hex_color("#FF0000");
var green = hex_color("#00FF00");
var forest_green = hex_color("#00cc00")

export class frisbee_flicker extends Scene {
    constructor() {
        // constructor(): Scenes begin by populating initial values like the Shapes and Materials they'll need.
        super();

        // At the beginning of our program, load one of each of these shape definitions onto the GPU.
        this.shapes = {
            frisbee: new defs.Capped_Cylinder(4, 12, [[0, 2], [0, 1]]),
            target: new defs.Capped_Cylinder(4, 12, [[0, 2], [0, 1]]),
            sphere: new defs.Subdivision_Sphere(4),
        };

        // *** Materials
        this.materials = {
            test: new Material(new defs.Phong_Shader(),
                { ambient: .4, diffusivity: .6, color: hex_color("#ffffff") }),

        }

        this.initial_camera_location = Mat4.look_at(vec3(0, 15, 20), vec3(0, 15, 0), vec3(0, 1, 0));
        this.angle_left = false
        this.angle_right = false
        this.frisbee_angle = 0;
        this.frisbee_angle_display = 0;

        //control mechanics
        this.reset = false;
        this.increase_velocity = false;
        this.decrease_velocity = false;

        //frisbee_throwing mechanics
        this.distance = 0;
        this.throw = false;
        this.thrown = false;
        this.throw_time = 0;
        this.throwing_height = 10;
        this.throwing_angle = 12;
        this.velocity = 14;
        this.horizontal_velocity = 0;
        this.vertical_velocity = 0;
        this.frisbee_height = 10;
        this.elapsed_time_prev = 0;
        this.curve = 0;

        //frisbee trail mechanics
        this.frisbee_trail_transforms = [];
        this.show_trail = false;

        //target mechanics
        this.target_color = [];

        //collision mechanics
        this.collider = { intersect_test: Body.intersect_sphere, points: new defs.Subdivision_Sphere(1), leeway: .5 }
        this.bodies = []
        const phong = new defs.Phong_Shader(1);
        this.bright = new Material(phong, { color: color(0, 1, 0, .5), ambient: 1 });
        this.collided = false;

        //level mechanics
        this.current_level = 1
        this.stage_targets = []
        this.start_stage = true;
        this.completed_time = 0;
        this.attempt_count = 0;



    }

    make_control_panel() {

        this.control_panel.innerHTML += "Current Frisbee Bearings:<br>";
        this.live_string(box => box.textContent = "- Velocity: " + this.velocity + " m/s");
        this.new_line();
        this.live_string(box => box.textContent = "- Angle: " + Math.floor(this.frisbee_angle_display) + " degrees");
        this.new_line();
        this.new_line();
        this.key_triggered_button("Angle Left", ["c"], () => this.angle_left = true);
        this.key_triggered_button("Angle Right", ["b"], () => this.angle_right = true);
        this.key_triggered_button("Throw", ["Enter"], () => this.throw = true);
        this.key_triggered_button("Reset", ["t"], () => this.reset = true);
        this.new_line();
        this.key_triggered_button("Show Trail", ["]"], () => this.show_trail = !this.show_trail);
        this.new_line()
        this.key_triggered_button("Increase Velocity", ["="], () => this.increase_velocity = true);
        this.key_triggered_button("Decrease Velocity", ["-"], () => this.decrease_velocity = true);
        this.new_line();
        this.new_line();
        this.live_string(box => box.textContent = "- Current Level: " + this.current_level);
        this.new_line();
        this.live_string(box => box.textContent = "- Number of Attempts: " + this.attempt_count);
        this.new_line();

    }

    increase_vel() {
        if (this.increase_velocity && this.velocity < 24) {
            this.velocity += 1;
            this.increase_velocity = false;
        }
    }

    decrease_vel() {
        if (this.decrease_velocity && this.velocity > 11) {
            this.velocity -= 1;
            this.decrease_velocity = false;
        }
    }


    throwing_angle_rad() {
        return this.throwing_angle / 180 * Math.PI
    }

    calculate_drag(velocity, air_density, area, drag_coefficient) {

        //Use the Prandtl Relationship to calculate the drag force (horizontal) on the frisbee

        let drag_force = 0.5 * (air_density) * (velocity ** 2) * area * drag_coefficient

        return drag_force
    }

    calculate_lift(velocity, air_density, area, angle_of_attack) {
        //lift coefficient calculation
        let lift_coefficient_intercept = 0.15
        let lift_coefficient_attack = 1.4
        let lift_coefficient = lift_coefficient_intercept + angle_of_attack * lift_coefficient_attack

        //Use the Bernoulli Equation to calculate the lift force (vertical) generated by the frisbee

        let lift_force = 0.5 * (air_density) * (velocity ** 2) * area * lift_coefficient

        //account for angled throw
        if (this.frisbee_angle > 0) {
            lift_force = lift_force / (1 + 1.5 * Math.abs(Math.sin(this.frisbee_angle * Math.PI / 180)))
        }
        return lift_force
    }

    calculate_distance(angle, time) {

        let mass = 0.175
        let gravity = 9.8
        let density_of_air_at_sea_level = 1.23
        let standard_frisbee_area = 0.0531


        //drag calculations
        let angle_of_attack = angle
        let angle_of_least_incidence = -0.0698132

        //drag coefficient calculation
        let form_drag = 0.08
        let induced_drag = 2.72
        let drag_coefficient = form_drag + induced_drag * (angle_of_attack - angle_of_least_incidence) ** 2


        //calculate lift force
        let lift_force = this.calculate_lift(this.horizontal_velocity, density_of_air_at_sea_level, standard_frisbee_area, angle)
        let gravitational_force = mass * gravity

        let vertical_force = lift_force - gravitational_force
        let vertical_acceleration = vertical_force / mass

        //account for frisbee terminal velocity
        let terminal_velocity = -Math.sqrt((2 * gravitational_force) / (density_of_air_at_sea_level * drag_coefficient * standard_frisbee_area))

        if (this.vertical_velocity + 0.5 * (vertical_acceleration * time) <= terminal_velocity) {
            this.vertical_velocity = terminal_velocity
        }
        else {
            this.vertical_velocity = this.vertical_velocity + 0.5 * (vertical_acceleration * time)
        }




        let drag_force = this.calculate_drag(this.horizontal_velocity, density_of_air_at_sea_level, standard_frisbee_area, drag_coefficient)
        let horizontal_acceleration = -drag_force / mass


        this.horizontal_velocity = this.horizontal_velocity + 0.5 * (horizontal_acceleration * time)




    }

    calculate_arc(time) {

        let process_angle = this.frisbee_angle
        if (this.frisbee_angle > 45) {
            process_angle = 90 - this.frisbee_angle;
            if (this.frisbee_angle < 0) {
                process_angle = -90 - this.frisbee_angle
            }
        }


        let curve_angle = (process_angle) / 180 * Math.PI
        curve_angle = Math.round((curve_angle + Number.EPSILON) * 1000) / 1000

        // console.log("curve angle:" , curve_angle)
        // console.log("frisbee angle:" , this.frisbee_angle)

        let arc_calculation = (Math.sin(curve_angle)) * (-((2 * time - 10) ** 2) + 100)


        arc_calculation = Math.round((arc_calculation + Number.EPSILON) * 1000) / 1000
        // console.log("arc calculation:" , arc_calculation)

        // if((this.curve < 0 &&  this.arc_calculation > 0) || (this.curve > 0 && this.arc_calculation < 0) ){
        //     this.curve = 0
        // }
        // else{
        //     this.curve = arc_calculation
        // }

        this.curve = arc_calculation

    }

    update_fribsee_angle() {
        if (this.frisbee_angle < 0) {
            this.frisbee_angle += (1 / 25);
            // if(this.frisbee_angle>=0){
            //     this.frisbee_angle = 0
            // }
        } else {
            this.frisbee_angle -= (1 / 25);
            // if(this.frisbee_angle<=0){
            //     this.frisbee_angle = 0
            // }
        }
    }

    set_stage() {
        if (this.start_stage) {
            if (this.current_level == 1) {
                this.stage_targets = Array(1).fill(false)
                this.target_color = Array(1).fill(red)
            }

            if (this.current_level == 2) {
                this.stage_targets = Array(2).fill(false)
                this.target_color = Array(2).fill(red)
            }

            this.start_stage = false;
        }
    }



    soft_reset() {
        if (this.reset) {
            this.reset = false;
            this.thrown = false;
            this.frisbee_angle = 0;
            this.distance = 0;
            this.throw_time = 0;
            this.frisbee_height = 10;
            this.vertical_velocity = 0;
            this.horizontal_velocity = 0;
            this.elapsed_time_prev = 0;
            this.curve = 0;
            this.frisbee_trail_transforms = [];
            this.show_trail = false;
            // this.target_color = red; //need to fix
            this.collided = false;
            this.bodies = []
            

        }

    }

    check_stage_completion(dt) {
        for (let i = 0; i < this.stage_targets.length; i++) {
            if (!this.stage_targets[i])
                return false;
        }
        this.completed_time += dt;
        if (this.completed_time > 2) {
            this.current_level++;
            this.start_stage = true;
            this.reset = true;
            this.completed_time = 0;
            this.attempt_count = 0;
        }


        return true;
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



        const t = program_state.animation_time / 1000, dt = program_state.animation_delta_time / 1000;

        this.set_stage()


        //model transform creation
        let model_transform = Mat4.identity();

        const light_position = vec4(0, 20, 0, 1);
        // The parameters of the Light are: position, color, size
        program_state.lights = [new Light(light_position, yellow, 1000)];

        this.soft_reset()

        //control signals
        this.increase_vel();
        this.decrease_vel();



        let frisbee_transform = model_transform
        // console.log(this.frisbee_angle)



        if (this.throw) {
            this.thrown = true;
            this.throw = false;
            this.horizontal_velocity = this.velocity * Math.cos(this.throwing_angle_rad())
            this.vertical_velocity = this.velocity * Math.sin(this.throwing_angle_rad())
            this.throw_time = t;
            this.frisbee_height = this.throwing_height
            this.attempt_count++;
        }
        let frisbee_scale = Mat4.scale(3, 3, 1 / 2)


        // console.log(this.throw)
        if (!this.thrown) {
            if (this.angle_left) {
                this.frisbee_angle -= 2
                if (this.frisbee_angle < -90) {
                    this.frisbee_angle = -90
                }
                this.angle_left = false
            }
            if (this.angle_right) {
                this.frisbee_angle += 2
                if (this.frisbee_angle > 90) {
                    this.frisbee_angle = 90
                }
                this.angle_right = false
            }
            this.frisbee_angle_display = this.frisbee_angle;
        }
        if (this.thrown) {
            let elapsed_time = t - this.throw_time;
            let time = elapsed_time - this.elapsed_time_prev
            this.calculate_distance(this.throwing_angle_rad(), time)

            this.distance += (this.horizontal_velocity * time) * 8
            this.frisbee_height += (this.vertical_velocity * time)

            if (this.frisbee_height < 0) {
                this.frisbee_height = 0;
                this.thrown = false;
                // this.reset = true;
            }


            this.calculate_arc(elapsed_time)


            frisbee_transform = frisbee_transform.times(Mat4.translation(this.curve, this.frisbee_height, -this.distance))
            //.times(Mat4.rotation(this.distance/45*Math.PI,0,1,0))
            this.elapsed_time_prev = elapsed_time
            this.update_fribsee_angle()


            this.frisbee_trail_transforms.push(frisbee_transform.times(Mat4.scale(0.2, 0.2, 0.2)))
            frisbee_transform = frisbee_transform.times(Mat4.rotation(Math.PI / 2, 1, 0, 0)).times(Mat4.rotation(this.frisbee_angle / 180 * Math.PI, 0, 1, 0)).times(Mat4.rotation(Math.PI / 180, 0, 0, 1))


        }
        else {
            // console.log(this.distance)
            frisbee_transform = frisbee_transform.times(Mat4.translation(this.curve, this.frisbee_height, -this.distance))
            frisbee_transform = frisbee_transform.times(Mat4.rotation(Math.PI / 2, 1, 0, 0)).times(Mat4.rotation(this.frisbee_angle / 180 * Math.PI, 0, 1, 0))
            console.log("test")
        }

        frisbee_transform = frisbee_transform.times(frisbee_scale)
        this.shapes.frisbee.draw(context, program_state, frisbee_transform, this.materials.test.override({ color: yellow, ambient: 1 }));

        //draw frisbee trail
        if (this.show_trail) {
            for (let i = 0; i < this.frisbee_trail_transforms.length; i++) {
                this.shapes.sphere.draw(context, program_state, this.frisbee_trail_transforms[i], this.materials.test.override({ color: yellow, ambient: 1 }));

            }

        }


        //create targets
        if (this.current_level == 1) {
            let target_transform = model_transform.times(Mat4.translation(0, 0, -400)).times(Mat4.scale(5, 5, 1 / 2))
            this.shapes.target.draw(context, program_state, target_transform, this.materials.test.override({ color: this.target_color[0], ambient: 1 }))

            if (this.bodies.length == 0) {
                this.bodies.push(new Body(this.shapes.frisbee, this.materials.test.override({ color: red, ambient: 1 }), vec3(3, 3, 1 / 2)))
                this.bodies.push(new Body(this.shapes.target, this.materials.test.override({ color: red, ambient: 1 }), vec3(5, 5, 1 / 2)))
            }

            this.bodies[0].emplace(frisbee_transform);
            this.bodies[1].emplace(target_transform)
        }
        else if (this.current_level == 2) {
            let target_transform1 = model_transform.times(Mat4.translation(50, 0, -400)).times(Mat4.scale(5, 5, 1 / 2))
            let target_transform2 = model_transform.times(Mat4.translation(-50, 0, -400)).times(Mat4.scale(5, 5, 1 / 2))

            this.shapes.target.draw(context, program_state, target_transform1, this.materials.test.override({ color: this.target_color[0], ambient: 1 }))
            this.shapes.target.draw(context, program_state, target_transform2, this.materials.test.override({ color: this.target_color[1], ambient: 1 }))


            if (this.bodies.length == 0) {
                this.bodies.push(new Body(this.shapes.frisbee, this.materials.test.override({ color: red, ambient: 1 }), vec3(3, 3, 1 / 2)))
                this.bodies.push(new Body(this.shapes.target, this.materials.test.override({ color: red, ambient: 1 }), vec3(5, 5, 1 / 2)))
                this.bodies.push(new Body(this.shapes.target, this.materials.test.override({ color: red, ambient: 1 }), vec3(5, 5, 1 / 2)))
            }

            this.bodies[0].emplace(frisbee_transform);
            this.bodies[1].emplace(target_transform1);
            this.bodies[2].emplace(target_transform2);;
        }



        const points = this.collider.points
        const leeway = this.collider.leeway
        const size = vec3(1 + leeway, 1 + leeway, 1 + leeway);
        for (let a of this.bodies) {

            points.draw(context, program_state, (a.location_matrix).times(Mat4.scale(...size)), this.bright, "LINE_STRIP");


            // for (let b of this.bodies) {
            //     // Pass the two bodies and the collision shape to check_if_colliding():
            //     if (!a.check_if_colliding(b, this.collider)){
            //         console.log("collided")

            //     }
            //     // If we get here, we collided, so turn red and zero out the
            //     // velocity so they don't inter-penetrate any further.
            //     // a.material = this.active_color;
            //     // a.linear_velocity = vec3(0, 0, 0);
            //     // a.angular_velocity = 0;
            // }
            // if(frisbee_body.check_if_colliding(target_body, this.collider)){
            //     console.log("collided")
            // }
            let index = 0
            for (let b of this.bodies) {

                if (a.check_if_colliding(b, this.collider)) {
                    console.log("collided")
                    this.horizontal_velocity = 0;
                    this.target_color[index - 1] = forest_green;
                    this.collided = true;

                    this.stage_targets[index - 1] = true;
                }
                index++;
            }

        }


        this.check_stage_completion(dt);




    }
}