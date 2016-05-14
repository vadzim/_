import { Component } from "react"
import { Link } from "react-router"

export default
class Main extends Component {
	render() {
		return <div>
			ABCD_EF
			<form>
				<input />
				<input type = "submit" />
			</form>
			{ this.props.children }
		</div>
	}
}
